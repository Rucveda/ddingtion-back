import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import prisma from './db.js';
import { env, getDiscordConfigStatus } from './config/env.js';

// [소켓 모듈 분리]
import setupSocket from './socket.js';

// [워커 가동]
import './workers/auctionWorker.js'; 

import { mountApiRoutes } from './routes/index.js';
import { attachClientIp, rejectStrictBannedIp } from './middlewares/accessGuards.js';

const app = express();
const server = http.createServer(app);

/**
 * 🛠️ [환경 변수 패치] 
 * 하드코딩된 프론트엔드 주소를 환경 변수(FRONTEND_URL)로 대체합니다.
 * 값이 없을 경우를 대비해 기본값도 유지합니다.
 */
const FRONTEND_URL = env.FRONTEND_URL;

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
app.use(attachClientIp);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use('/api', rejectStrictBannedIp);

mountApiRoutes(app);

const PORT = Number(env.PORT);

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log("✅ 데이터베이스(PostgreSQL) 연결 성공!");
    const discordConfig = getDiscordConfigStatus();
    console.log(
      `✅ Discord 인증 설정: ${discordConfig.enabled ? "활성" : "비활성"}${discordConfig.missing.length ? ` (누락: ${discordConfig.missing.join(", ")})` : ""}`,
    );

    server.listen(PORT, '0.0.0.0', () => { 
      console.log(`🚀 DDINGTION 백엔드 서버 실행 중: ${PORT}`);
    });
  } catch (err) {
    console.error("❌ DB 연결 실패:", err);
    process.exit(1); 
  }
};

startServer();