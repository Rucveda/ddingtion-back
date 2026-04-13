import 'dotenv/config';
import express from 'express';
const router = express.Router();
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import authenticateToken from '../middlewares/authMiddleware.js';
import prisma from '../db.js';
import { createClient } from '@supabase/supabase-js'; // 추가
import { Queue } from 'bullmq';
import Redis from 'ioredis';

// ✅ Supabase 클라이언트 설정
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * 📂 [이미지 저장 설정 패치] 
 * diskStorage를 지우고 memoryStorage로 변경합니다.
 * 이제 서버 하드디스크가 아닌 메모리에 파일을 담아 Supabase로 바로 쏩니다.
 */
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

/**
 * 🛠️ [Redis 및 BullMQ 큐 설정]
 */
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  ...(redisUrl.includes('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});
const auctionQueue = new Queue('auctionQueue', { connection: redisConnection });

/**
 * 👑 관리자 권한 확인 미들웨어
 */
const isAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "인증되지 않은 사용자입니다." });
  const userRole = req.user.role ? req.user.role.toUpperCase() : '';
  if (userRole !== 'ADMIN') return res.status(403).json({ error: "관리자 권한이 필요합니다." });
  next();
};

router.use(authenticateToken);
router.use(isAdmin);

// --- [시세 및 시장 관리 서비스] ---

/**
 * [GET] 시세 변수 전체 조회
 */
router.get('/market/variables', async (req, res) => {
  try {
    const variables = await prisma.marketVariable.findMany({
      orderBy: { category: 'asc' }
    });
    res.json(variables);
  } catch (error) {
    res.status(500).json({ error: "변수 목록 로드 실패" });
  }
});

/**
 * [POST] 시세 변수 설정/업데이트
 */
router.post('/market/variables', async (req, res) => {
  try {
    const { key, value, category, label } = req.body;
    const variable = await prisma.marketVariable.upsert({
      where: { key: key },
      update: { value: parseFloat(value), label, category },
      create: { key, value: parseFloat(value), label, category }
    });
    res.json({ message: "변수가 저장되었습니다.", variable });
  } catch (error) {
    res.status(500).json({ error: "변수 저장 실패" });
  }
});

/**
 * [GET] 거래 이력 관리 리스트
 */
router.get('/market/history', async (req, res) => {
  try {
    const history = await prisma.marketHistory.findMany({
      include: { item: { select: { name: true, category: true } } },
      orderBy: { tradeDate: 'desc' },
      take: 200 
    });
    const safeHistory = history.map(h => ({
      ...h,
      price: h.price.toString()
    }));
    res.json(safeHistory);
  } catch (error) {
    res.status(500).json({ error: "거래 이력 로드 실패" });
  }
});

/**
 * [PATCH] 거래 데이터 유효성 변경
 */
router.patch('/market/history/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isValid, excludeReason } = req.body;
    const updated = await prisma.marketHistory.update({
      where: { id: parseInt(id) },
      data: { 
        isValid: Boolean(isValid), 
        excludeReason: isValid ? null : excludeReason 
      }
    });
    res.json({ message: "데이터 상태 업데이트 완료", updated });
  } catch (error) {
    res.status(500).json({ error: "상태 변경 실패" });
  }
});

/**
 * 💉 [POST] 시장 거래 데이터 수동 주입
 */
router.post('/market/history/inject', async (req, res) => {
  try {
    const { 
      itemId, price, tradeDate, 
      enhancementLevel, enhancementRank, enchantments, imprint, skills, runes 
    } = req.body;

    const history = await prisma.marketHistory.create({
      data: {
        itemId: parseInt(itemId),
        price: BigInt(price),
        tradeDate: new Date(tradeDate),
        enhancementLevel: parseInt(enhancementLevel) || 0,
        enhancementRank: enhancementRank || null,
        enchantments: enchantments || null,
        imprint: imprint || null,
        skills: skills || null,
        runes: runes || null,
        isLegacy: false,
        isValid: true
      }
    });

    res.status(201).json({ 
      message: "거래 데이터가 성공적으로 주입되었습니다.", 
      id: history.id.toString() 
    });
  } catch (error) {
    console.error("Injection Error:", error);
    res.status(500).json({ error: "데이터 주입 실패" });
  }
});

/**
 * [DELETE] 거래 이력 기록 삭제
 */
router.delete('/market/history/:id', async (req, res) => {
  try {
    await prisma.marketHistory.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: "거래 기록이 영구 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ error: "기록 삭제 실패" });
  }
});

// --- [관리 서비스 강화 패치] ---

/**
 * [GET] 전체 유저 목록 조회
 */
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, loginId: true, ingameName: true, role: true, createdAt: true, reputationScore: true, successfulTrades: true },
      orderBy: { id: 'asc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "유저 목록 로드 실패" });
  }
});

/**
 * [GET] 모든 신고 내역 조회
 */
router.get('/reports', async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      include: {
        reporter: { select: { id: true, ingameName: true } },
        target: { select: { id: true, ingameName: true } },
        room: { select: { id: true, status: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: "신고 내역 로드 실패" });
  }
});

/**
 * [PATCH] 신고 사건 처리 상태 변경
 */
router.patch('/reports/:id/resolve', async (req, res) => {
  try {
    const updatedReport = await prisma.report.update({
      where: { id: parseInt(req.params.id) },
      data: { isResolved: req.body.isResolved }
    });
    res.json({ message: "신고 처리 완료", updatedReport });
  } catch (error) {
    res.status(500).json({ error: "상태 변경 실패" });
  }
});

/**
 * [DELETE] 해결된 신고 기록 삭제
 */
router.delete('/reports/:id', async (req, res) => {
  try {
    await prisma.report.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "신고 로그 영구 삭제 완료" });
  } catch (error) {
    res.status(500).json({ error: "로그 삭제 실패" });
  }
});

/**
 * [GET] 아이템 DB 목록 조회
 */
router.get('/items', async (req, res) => {
  try {
    const items = await prisma.item.findMany({ orderBy: { id: 'desc' } });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "아이템 목록 로드 실패" });
  }
});

/**
 * 💉 [신규 패치] 새 아이템 등록 (Supabase Storage 연동)
 */
router.post('/items', upload.single('image'), async (req, res) => {
  try {
    const { name, category } = req.body;
    if (!name || !category) return res.status(400).json({ error: "이름과 카테고리는 필수입니다." });
    if (!req.file) return res.status(400).json({ error: "이미지 파일이 누락되었습니다." });

    const existingItem = await prisma.item.findUnique({ where: { name } });
    if (existingItem) return res.status(400).json({ error: "이미 존재하는 아이템 이름입니다." });

    // 1️⃣ Supabase Storage 업로드
    const fileName = `item-${Date.now()}${path.extname(req.file.originalname)}`;
    const { data, error } = await supabase.storage
      .from('images') // Supabase에서 만든 버킷 이름
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (error) throw error;

    // 2️⃣ 공개 URL 생성
    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    // 3️⃣ DB 저장 (서버 주소가 아닌 Supabase 주소 저장)
    const newItem = await prisma.item.create({ 
      data: { name, category, iconUrl: publicUrl } 
    });

    res.status(201).json(newItem);
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "아이템 등록 중 서버 오류가 발생했습니다." });
  }
});

/**
 * 💉 [신규 패치] 아이템 삭제 (Supabase Storage에서도 삭제)
 */
router.delete('/items/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ error: "아이템 없음" });

    await prisma.$transaction(async (tx) => {
      // 1. 연관 데이터 삭제 로직 (기존 유지)
      const auctions = await tx.auction.findMany({ where: { itemId } });
      const auctionIds = auctions.map(a => a.id);
      if (auctionIds.length > 0) {
        await tx.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
        await tx.chatRoom.deleteMany({ where: { auctionId: { in: auctionIds } } });
        await tx.review.deleteMany({ where: { auctionId: { in: auctionIds } } });
      }
      await tx.auction.deleteMany({ where: { itemId } });
      await tx.marketHistory.deleteMany({ where: { itemId } });

      // 2. Supabase Storage 파일 삭제
      if (item.iconUrl && item.iconUrl.includes('supabase.co')) {
        const fileName = item.iconUrl.split('/').pop();
        await supabase.storage.from('images').remove([fileName]);
      }

      await tx.item.delete({ where: { id: itemId } });
    });

    res.json({ message: "아이템 및 클라우드 이미지 삭제 완료" });
  } catch (error) {
    res.status(500).json({ error: "삭제 중 서버 오류" });
  }
});

/**
 * 상담 목록 조회
 */
router.get('/support/rooms', async (req, res) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: { isAdminChat: true },
      include: { 
        buyer: { select: { id: true, ingameName: true } }, 
        messages: { orderBy: { createdAt: 'desc' }, take: 1 } 
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: "상담 내역 로드 실패" });
  }
});

/**
 * 해결된 상담방 삭제
 */
router.delete('/support/rooms/:id', async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { roomId } }),
      prisma.report.deleteMany({ where: { roomId } }),
      prisma.chatRoom.delete({ where: { id: roomId } })
    ]);
    res.json({ message: "상담 내역이 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ error: "상담 삭제 실패" });
  }
});

/**
 * 경매 강제 취소
 */
router.delete('/auctions/:id', async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: 'CANCELED' }
    });

    // 💡 패치: 관리자 강제 취소 시 대기 중인 예약 작업(Job)도 삭제
    try {
      const job = await auctionQueue.getJob(`auction_${auctionId}`);
      if (job) {
        await job.remove();
        console.log(`[관리자] 경매 ${auctionId} 강제 취소로 인한 큐 정리 완료`);
      }
    } catch (jobErr) {
      console.error("관리자 BullMQ 큐 제거 중 예외 (무시됨):", jobErr);
    }

    res.json({ message: "경매 취소 성공" });
  } catch (error) {
    res.status(500).json({ error: "경매 취소 실패" });
  }
});

/**
 * 👤 [PATCH] 유저 권한 및 역할 변경
 * 기존의 단순 토글에서 나아가 Body로 전달된 모든 역할을 수용하도록 개선
 */
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: "변경할 역할이 지정되지 않았습니다." });

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { role: role.toUpperCase() }
    });

    res.json({ 
      message: `${updatedUser.ingameName}님의 권한이 ${updatedUser.role}(으)로 변경되었습니다.`, 
      user: updatedUser 
    });
  } catch (error) {
    console.error("Role Update Error:", error);
    res.status(500).json({ error: "권한 변경 실패" });
  }
});

/**
 * 🚫 [PATCH] 유저 계정 차단 (Ban/Unban)
 * 유저의 접근 권한을 즉시 통제합니다.
 */
router.patch('/users/:id/ban', async (req, res) => {
  try {
    const { id } = req.params;
    const { isBanned } = req.body; // true 또는 false

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isBanned: Boolean(isBanned) }
    });

    res.json({ 
      message: isBanned ? "사용자가 차단되었습니다." : "사용자 차단이 해제되었습니다.",
      isBanned: user.isBanned 
    });
  } catch (error) {
    console.error("Ban Error:", error);
    res.status(500).json({ error: "밴 상태 변경 실패" });
  }
});

/**
 * 🔍 [GET] 전체 유저 목록 조회 (밴 상태 포함)
 */
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { 
        id: true, 
        loginId: true, 
        ingameName: true, 
        role: true, 
        isBanned: true, // 💡 밴 상태 추가
        createdAt: true, 
        reputationScore: true, 
        successfulTrades: true 
      },
      orderBy: { id: 'asc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "유저 목록 로드 실패" });
  }
});

export default router;