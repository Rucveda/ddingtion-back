const prisma = require('./db');

const setupSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`유저 접속됨: ${socket.id}`);

    // --- 0. 전역 알림 설정 (추가) ---
    // 프론트엔드의 NotificationOverlay에서 호출함
    socket.on('setup_notifications', (userId) => {
      socket.join(`user_${userId}`);
      console.log(`알림 채널 구독: user_${userId}`);
    });

    // --- 1. 경매 관련 로직 ---
    socket.on('join_auction', (auctionId) => {
      socket.join(`auction_${auctionId}`);
    });

    socket.on('place_bid', async (data) => {
      const { auctionId, userId, bidAmount } = data;
      try {
        // 트랜잭션 시작 전, 이전 최고 입찰자 정보를 미리 조회합니다.
        const previousHighestBid = await prisma.bid.findFirst({
          where: { auctionId: parseInt(auctionId) },
          orderBy: { bidAmount: 'desc' },
          include: { bidder: true }
        });

        const updatedAuction = await prisma.$transaction(async (tx) => {
          const auctions = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${parseInt(auctionId)} FOR UPDATE`;
          const auction = auctions[0];

          if (!auction || auction.status !== 'ACTIVE' || bidAmount <= auction.currentPrice) {
            throw new Error("입찰할 수 없는 상태이거나 금액이 너무 낮습니다.");
          }

          // 입찰 기록 생성
          const newBid = await tx.bid.create({ 
            data: { 
              auctionId: auction.id, 
              bidderId: parseInt(userId), 
              bidAmount: parseInt(bidAmount) 
            },
            include: { bidder: true }
          });

          // 경매 현재가 업데이트
          const auctionUpdate = await tx.auction.update({ 
            where: { id: auction.id }, 
            data: { currentPrice: parseInt(bidAmount) },
            include: { item: true }
          });

          return { auctionUpdate, newBid };
        });

        const { auctionUpdate, newBid } = updatedAuction;

        // A. 해당 경매 페이지에 있는 모든 유저에게 새 가격 브로드캐스트
        io.to(`auction_${auctionId}`).emit('bid_updated', {
          auctionId: auctionUpdate.id,
          newPrice: auctionUpdate.currentPrice,
          lastBidder: newBid.bidder.ingameName 
        });

        // 💡 B. [핵심 패치] 상위 입찰 알림 전송 (Outbid Notification)
        // 이전 입찰자가 있고, 그 유저가 현재 입찰자(본인)가 아닐 때만 1:1 전송
        if (previousHighestBid && previousHighestBid.bidderId !== parseInt(userId)) {
          io.to(`user_${previousHighestBid.bidderId}`).emit('outbid_notification', {
            auctionId: auctionId,
            itemName: auctionUpdate.item.name,
            newPrice: auctionUpdate.currentPrice,
            message: `PROTOCOL WARNING: [${auctionUpdate.item.name}]의 입찰 주도권을 상실했습니다!`
          });
        }

      } catch (error) {
        console.error("Bid Error:", error);
        socket.emit('bid_error', { message: error.message });
      }
    });


    // --- 2. 채팅 관련 로직 ---

    socket.on('join_room', ({ roomId }) => {
      socket.join(`chat_${roomId}`);
      console.log(`채팅방 입장: chat_${roomId}`);
    });

    socket.on('send_message', async (data) => {
      const { roomId, senderId, content } = data;
      try {
        const savedMessage = await prisma.message.create({
          data: { 
            roomId: parseInt(roomId), 
            senderId: parseInt(senderId), 
            content 
          },
          include: { 
            sender: { select: { id: true, ingameName: true } } 
          }
        });

        io.to(`chat_${roomId}`).emit('new_message', savedMessage);
        io.emit('refresh_chat_rooms'); 
      } catch (error) {
        console.error("Message Error:", error);
        socket.emit('chat_error', { message: "메시지 전송 실패" });
      }
    });

    socket.on('buy_now_completed', (data) => {
      io.emit('refresh_chat_rooms');
    });

    socket.on('disconnect', () => {
      console.log(`유저 접속 해제: ${socket.id}`);
    });
  });
};

module.exports = setupSocket;