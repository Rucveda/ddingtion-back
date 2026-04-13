import prisma from './db.js';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

const setupSocket = (io) => {
  // --- [Redis Pub/Sub 구독 설정 (워커 이벤트 수신용)] ---
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redisOptions = {
    maxRetriesPerRequest: null,
    ...(redisUrl.includes('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
  };
  const subscriber = new Redis(redisUrl, redisOptions);
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
            decodedUser = jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key_123');
        } catch (err) {
            throw new Error("유효하지 않은 인증입니다.");
        }
        
        const parsedUserId = parseInt(decodedUser.id);
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
        const decodedUser = jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key_123');

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
        const decodedUser = jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key_123');

        const pRoomId = parseInt(roomId);
        const pSenderId = parseInt(decodedUser.id);

        if (isNaN(pRoomId) || isNaN(pSenderId)) return;

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