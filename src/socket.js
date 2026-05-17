import prisma from './db.js';
import jwt from 'jsonwebtoken';
import { env, isDiscordVerificationEnforced } from './config/env.js';
import { createRedisClient } from './lib/redis.js';

const setupSocket = (io) => {
  // --- [Redis Pub/Sub 구독 설정 (워커 이벤트 수신용)] ---
  const subscriber = createRedisClient();
  const redisConnection = createRedisClient(); // 💡 상태 저장/조회용 일반 클라이언트 추가
  const AUCTION_EVENTS_CHANNEL = 'auction-events';

  subscriber.subscribe(AUCTION_EVENTS_CHANNEL, (err) => {
    if (err) {
      console.error('❌ Redis 구독 실패:', err);
    } else {
      console.log(`✅ Redis 채널 구독 성공: ${AUCTION_EVENTS_CHANNEL}`);
    }
  });

  // 워커로부터 경매 종료 이벤트를 수신하여 클라이언트에 전파
  subscriber.on('message', (channel, message) => {
    if (channel === AUCTION_EVENTS_CHANNEL) {
      const data = JSON.parse(message);
      io.to(`auction_${data.auctionId}`).emit('auction_finished', data);
      io.emit('refresh_chat_rooms'); // 낙찰자와 판매자의 채팅 목록 갱신
    }
  });

  // --- [통합 웹소켓 로직] ---
  io.on('connection', (socket) => {
    console.log('유저 접속:', socket.id);
    
    // 💡 유저의 실제 접속 IP 추출
    const clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address;

    // --- 🔔 알림 설정 ---
    socket.on('setup_notifications', (userId) => {
      if (!userId || userId === "null" || userId === "undefined") {
        return console.warn(`⚠️ 유효하지 않은 유저 ID 알림 구독 시도 차단: ${userId}`);
      }
      socket.join(`user_${userId}`);
      console.log(`🔔 유저 ${userId} 알림 채널 구독 완료`);
    });

    // --- 🔨 경매 관련 이벤트 ---
    socket.on('join_auction', (auctionId) => {
      if (auctionId) socket.join(`auction_${auctionId}`);
    });

    socket.on('place_bid', async (data) => {
      try {
        // 💡 보안 패치: 클라이언트가 보내는 userId를 믿지 않고, JWT 토큰을 검증하여 유저를 식별합니다.
        const { auctionId, bidAmount, token } = data;
        
        if (!token) throw new Error("인증 토큰이 누락되었습니다.");
        let decodedUser;
        try {
            decodedUser = jwt.verify(token, env.JWT_SECRET);
        } catch (err) {
            throw new Error("유효하지 않은 인증입니다.");
        }
        
        const parsedUserId = parseInt(decodedUser.id);

        if (isDiscordVerificationEnforced()) {
          const bidder = await prisma.user.findUnique({
            where: { id: parsedUserId },
            select: { discordId: true },
          });
          if (!bidder?.discordId) {
            throw new Error(
              "디스코드 인증이 필요합니다. 마이페이지에서 계정을 연동한 뒤 입찰할 수 있습니다.",
            );
          }
        }
        
        // 💡 보안 패치: 유저의 최신 접속 IP를 Redis에 갱신 (1일 보관)
        await redisConnection.set(`user_ip:${parsedUserId}`, clientIp, 'EX', 86400);
        const parsedAuctionId = parseInt(auctionId);
        const parsedBidAmount = BigInt(bidAmount);

        if (isNaN(parsedAuctionId) || isNaN(parsedUserId)) return;

        const prevHighestBid = await prisma.bid.findFirst({
          where: { auctionId: parsedAuctionId },
          orderBy: { bidAmount: 'desc' },
          include: { auction: { include: { item: true } } }
        });

        const result = await prisma.$transaction(async (tx) => {
          const auctions = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${parsedAuctionId} FOR UPDATE`;
          const auction = auctions[0];

          if (!auction || auction.status !== 'ACTIVE') {
            throw new Error("이미 종료되었거나 무효한 경매입니다.");
          }
          if (parsedBidAmount <= BigInt(auction.currentPrice)) {
            throw new Error("입찰가가 현재가보다 낮습니다.");
          }
          if (auction.buyNowPrice && parsedBidAmount >= BigInt(auction.buyNowPrice)) {
            throw new Error("즉시 구매가 이상의 금액은 입찰할 수 없습니다. 즉시 구매 기능을 이용해주세요.");
          }
          if (auction.sellerId === parsedUserId) {
            throw new Error("본인이 등록한 경매에는 입찰할 수 없습니다.");
          }
          
          // 💡 어뷰징 방어: 판매자의 최근 접속 IP와 현재 입찰자의 IP가 동일한 경우 (다중 계정 자전거래 차단)
          const sellerIp = await redisConnection.get(`user_ip:${auction.sellerId}`);
          if (sellerIp && sellerIp === clientIp) {
            throw new Error("동일한 네트워크(IP) 환경에서는 입찰할 수 없습니다. (다중 계정 악용 방지)");
          }

          const newBid = await tx.bid.create({ 
            data: { 
              auctionId: parsedAuctionId,
              bidderId: parsedUserId,
              bidAmount: parsedBidAmount
            },
            include: { bidder: { select: { ingameName: true } } }
          });

          const auctionUpdate = await tx.auction.update({
            where: { id: parsedAuctionId },
            data: { currentPrice: parsedBidAmount },
            include: { item: true }
          });

          return { newBid, auctionUpdate };
        });

        io.to(`auction_${parsedAuctionId}`).emit('bid_updated', {
          newPrice: result.newBid.bidAmount.toString(),
          bidderName: result.newBid.bidder.ingameName
        });

        if (prevHighestBid && prevHighestBid.bidderId !== parsedUserId) {
          const itemName = result.auctionUpdate.item.name;
          const msg = `PROTOCOL WARNING: [${itemName}]의 입찰 주도권을 상실했습니다!`;
          
          await prisma.notification.create({
            data: {
              userId: prevHighestBid.bidderId,
              type: "OUTBID",
              message: msg,
              link: `/auction/${parsedAuctionId}`
            }
          });
          
          io.to(`user_${prevHighestBid.bidderId}`).emit('outbid_notification', {
            auctionId: parsedAuctionId,
            itemName: itemName,
            newPrice: result.newBid.bidAmount.toString(),
            message: msg
          });
        }
      } catch (error) {
        console.error("입찰 처리 오류:", error.message);
        socket.emit('chat_error', { message: error.message });
      }
    });


    // --- 💬 채팅 관련 이벤트 ---
    socket.on('join_room', async (data) => {
      try {
        const { roomId, token } = data;
        if (!token) throw new Error("인증 토큰 누락");
        const decodedUser = jwt.verify(token, env.JWT_SECRET);

        const pRoomId = parseInt(roomId);
        const pUserId = parseInt(decodedUser.id);
        if (isNaN(pRoomId) || isNaN(pUserId)) return;

        socket.join(`chat_${pRoomId}`);

        await prisma.message.updateMany({
          where: { roomId: pRoomId, senderId: { not: pUserId }, isRead: false },
          data: { isRead: true }
        });
        io.to(`chat_${pRoomId}`).emit('messages_read', { roomId: pRoomId, userId: pUserId });
        
        // 💡 최적화 패치: 모든 접속자에게 API 호출을 강제하여 서버가 멈추는 현상(DDoS) 방지
        const room = await prisma.chatRoom.findUnique({ where: { id: pRoomId } });
        if (room) {
          io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit('refresh_chat_rooms');
        }
      } catch (err) {
        console.error("채팅방 입장/읽음 처리 오류:", err.message);
      }
    });

    socket.on('send_message', async (data) => {
      try {
        const { roomId, token, content } = data;
        if (!token) throw new Error("인증 토큰 누락");
        const decodedUser = jwt.verify(token, env.JWT_SECRET);

        const pRoomId = parseInt(roomId);
        const pSenderId = parseInt(decodedUser.id);
        
        await redisConnection.set(`user_ip:${pSenderId}`, clientIp, 'EX', 86400); // IP 갱신

        if (isNaN(pRoomId) || isNaN(pSenderId)) return;

        // 💡 어뷰징 방어: 빈 메시지 전송 차단
        if (!content || content.trim() === "") throw new Error("빈 메시지는 전송할 수 없습니다.");

        // 💡 어뷰징 방어: 매크로 채팅 도배 방지 (2초당 3회 초과 시 차단)
        const rateKey = `ratelimit:chat:${pSenderId}`;
        const msgCount = await redisConnection.incr(rateKey);
        if (msgCount === 1) await redisConnection.expire(rateKey, 2); 
        if (msgCount > 3) throw new Error("메시지 전송이 너무 빠릅니다. 도배 방지를 위해 잠시 후 시도해주세요.");

        // 💡 보안 패치: 채팅방 소속 검증 (권한이 없는 유저의 메시지 발송 차단)
        const room = await prisma.chatRoom.findUnique({ where: { id: pRoomId } });
        if (!room || (room.sellerId !== pSenderId && room.buyerId !== pSenderId && decodedUser.role !== 'ADMIN')) {
          throw new Error("채팅방 전송 권한 없음");
        }

        const newMessage = await prisma.message.create({
          data: { roomId: pRoomId, senderId: pSenderId, content, isRead: false },
          include: { sender: { select: { id: true, ingameName: true } } }
        });

        io.to(`chat_${pRoomId}`).emit('new_message', newMessage);
        // 💡 최적화 패치: 메시지를 주고받는 당사자들의 채팅방 목록만 새로고침
        io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit('refresh_chat_rooms');
      } catch (err) {
        console.error("메시지 저장 실패:", err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log('유저 접속 종료:', socket.id);
    });
  });
};

export default setupSocket;