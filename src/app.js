import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import prisma from './db.js';

// [소켓 모듈 분리]
import setupSocket from './socket.js';

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
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ddingtion-front.vercel.app";

// --- [Socket.io 설정] ---
const io = new Server(server, {
  cors: { 
    origin: FRONTEND_URL, 
    methods: ["GET", "POST"], 
    credentials: true 
  }
});

app.set('io', io);

// --- [통합 소켓 모듈 마운트] ---
setupSocket(io);

// 💡 보안 패치: 프록시(Render 등 클라우드) 환경에서 실제 유저의 IP를 정확히 식별하기 위해 설정
app.set('trust proxy', 1);

// --- [미들웨어 설정] ---
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", 'PATCH', "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

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

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => { 
  console.log(`🚀 DDINGTION 백엔드 서버 실행 중: ${PORT}`);
});