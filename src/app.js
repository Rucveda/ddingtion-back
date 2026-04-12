import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import prisma from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// [워커 가동]
import './workers/auctionWorker.js'; 

// --- [라우터 임포트] ---
import authRoutes from './routes/auth.js';
import auctionRoutes from './routes/auctions.js';
import adminRoutes from './routes/admin.js'; 
import chatRoutes from './routes/chat.js'; 
import notificationRoutes from './routes/notifications.js';
import reviewRoutes from './routes/reviews.js';
import postsRoutes from './routes/posts.js';

const app = express();
const server = http.createServer(app);

/**
 * 🛠️ [환경 변수 패치] 
 * 하드코딩된 프론트엔드 주소를 환경 변수(FRONTEND_URL)로 대체합니다.
 * 값이 없을 경우를 대비해 기본값도 유지합니다.
 */
const FRONTEND_URL = process.env.FRONTEND_URL || "ddingtion-front.vercel.app";

// --- [Socket.io 설정] ---
const io = new Server(server, {
  cors: { 
    origin: FRONTEND_URL, 
    methods: ["GET", "POST"], 
    credentials: true 
  }
});

app.set('io', io);

// --- [미들웨어 설정] ---
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

/**
 * 📂 [이미지 경로 패치]
 * 이제 Supabase Storage를 사용하므로 로컬 /uploads 정적 폴더 제공 코드는 사실상 필요 없습니다.
 * 하지만 기존 데이터와의 호환성을 위해 유지하거나, 필요 없다면 나중에 삭제하세요.
 */
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// DB 연결 확인
prisma.$connect()
  .then(() => console.log("✅ 데이터베이스(PostgreSQL) 연결 성공!"))
  .catch((err) => {
    console.error("❌ DB 연결 실패:", err);
    process.exit(1); 
  });

// --- [라우터 등록] ---
app.use('/api/auth', authRoutes);      
app.use('/api/auctions', auctionRoutes); 
app.use('/api/admin', adminRoutes);    
app.use('/api/chat', chatRoutes); 
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/posts', postsRoutes); 

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
      const { auctionId, userId, bidAmount } = data;
      const parsedAuctionId = parseInt(auctionId);
      const parsedUserId = parseInt(userId);
      const parsedBidAmount = parseInt(bidAmount);

      if (isNaN(parsedAuctionId) || isNaN(parsedUserId)) return;

      const prevHighestBid = await prisma.bid.findFirst({
        where: { auctionId: parsedAuctionId },
        orderBy: { bidAmount: 'desc' },
        include: { auction: { include: { item: true } } }
      });

      const result = await prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({ where: { id: parsedAuctionId } });
        if (!auction || parsedBidAmount <= auction.currentPrice) {
          throw new Error("입찰가가 현재가보다 낮습니다.");
        }

        const newBid = await tx.bid.create({
          data: {
            auctionId: parsedAuctionId,
            bidderId: parsedUserId,
            bidAmount: parsedBidAmount
          },
          include: { bidder: { select: { ingameName: true } } }
        });

        await tx.auction.update({
          where: { id: parsedAuctionId },
          data: { currentPrice: parsedBidAmount }
        });

        return { newBid };
      });

      io.to(`auction_${parsedAuctionId}`).emit('bid_updated', {
        newPrice: result.newBid.bidAmount,
        bidderName: result.newBid.bidder.ingameName
      });

      if (prevHighestBid && prevHighestBid.bidderId !== parsedUserId) {
        const msg = `[${prevHighestBid.auction.item.name}]의 입찰 주도권을 상실했습니다!`;
        await prisma.notification.create({
          data: {
            userId: prevHighestBid.bidderId,
            type: "OUTBID",
            message: msg,
            link: `/auction/${parsedAuctionId}`
          }
        });
        io.to(`user_${prevHighestBid.bidderId}`).emit('outbid_notification', { message: msg });
      }
    } catch (error) {
      console.error("입찰 처리 오류:", error.message);
      socket.emit('chat_error', { message: error.message });
    }
  });

  socket.on('buy_now_completed', async (data) => {
    try {
      const { auctionId, buyerName, finalPrice, sellerId } = data;
      const pAuctionId = parseInt(auctionId);
      const pSellerId = parseInt(sellerId);
      
      io.to(`auction_${pAuctionId}`).emit('auction_finished', {
        winner: buyerName,
        price: finalPrice,
        reason: 'BUY_NOW'
      });

      if (!isNaN(pSellerId)) {
        const msg = `전리품 거래가 즉시 성사되었습니다. 구매자를 평가해주세요!`;
        await prisma.notification.create({
          data: { userId: pSellerId, type: "TRADE", message: msg }
        });
        io.to(`user_${pSellerId}`).emit('outbid_notification', { message: msg });
      }

      io.emit('refresh_chat_rooms'); 
    } catch (err) {
      console.error("즉구매 종료 처리 오류:", err);
    }
  });

  // --- 💬 채팅 관련 이벤트 ---
  socket.on('join_room', async ({ roomId, userId }) => {
    const pRoomId = parseInt(roomId);
    const pUserId = parseInt(userId);
    if (isNaN(pRoomId) || isNaN(pUserId)) return;

    socket.join(`chat_${pRoomId}`);

    try {
      await prisma.message.updateMany({
        where: { roomId: pRoomId, senderId: { not: pUserId }, isRead: false },
        data: { isRead: true }
      });
      io.to(`chat_${pRoomId}`).emit('messages_read', { roomId: pRoomId, userId: pUserId });
      io.emit('refresh_chat_rooms');
    } catch (err) {
      console.error("채팅 읽음 처리 오류:", err);
    }
  });

  socket.on('send_message', async (data) => {
    try {
      const { roomId, senderId, content } = data;
      const pRoomId = parseInt(roomId);
      const pSenderId = parseInt(senderId);

      if (isNaN(pRoomId) || isNaN(pSenderId)) return;

      const newMessage = await prisma.message.create({
        data: { roomId: pRoomId, senderId: pSenderId, content, isRead: false },
        include: { sender: { select: { id: true, ingameName: true } } }
      });

      io.to(`chat_${pRoomId}`).emit('new_message', newMessage);
      io.emit('refresh_chat_rooms');
    } catch (err) {
      console.error("메시지 저장 실패:", err);
    }
  });

  socket.on('disconnect', () => {
    console.log('유저 접속 종료:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => { 
  console.log(`🚀 DDINGTION 백엔드 서버 실행 중: ${PORT}`);
});