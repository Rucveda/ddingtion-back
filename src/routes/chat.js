const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const prisma = require('../db');

// 모든 채팅 API는 로그인이 필요함
router.use(authenticateToken);

/**
 * [GET] 내 채팅방 목록 가져오기
 * 💡 패치: 'ACTIVE' 상태이면서 일반 거래(isAdminChat: false)인 방만 반환
 */
router.get('/rooms', async (req, res) => {
  try {
    const userId = req.user.id; 
    
    const rooms = await prisma.chatRoom.findMany({
      where: {
        OR: [{ sellerId: userId }, { buyerId: userId }],
        status: 'ACTIVE', // 💡 종료(ARCHIVED/CLOSED)된 방은 여기서 걸러짐
        isAdminChat: false 
      },
      include: {
        seller: { select: { id: true, ingameName: true, reputationScore: true } },
        buyer: { select: { id: true, ingameName: true, reputationScore: true } },
        messages: { 
          orderBy: { createdAt: 'desc' }, 
          take: 1 
        } 
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(rooms);
  } catch (error) {
    console.error("Rooms Load Error:", error);
    res.status(500).json({ error: "채팅방 목록 로드 실패" });
  }
});

/**
 * [POST] 관리자 1:1 문의방 생성 및 가져오기
 * 💡 1대1 문의 버튼 클릭 시 호출됨
 */
router.post('/rooms/admin', async (req, res) => {
  try {
    const userId = req.user.id;

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!admin) return res.status(404).json({ error: "응대 가능한 관리자가 없습니다." });
    if (admin.id === userId) return res.status(400).json({ error: "관리자 본인은 사용할 수 없습니다." });

    let room = await prisma.chatRoom.findFirst({
      where: {
        buyerId: userId,
        isAdminChat: true 
      },
      include: {
        seller: { select: { id: true, ingameName: true } },
        buyer: { select: { id: true, ingameName: true } }
      }
    });

    if (!room) {
      room = await prisma.chatRoom.create({
        data: {
          sellerId: admin.id, 
          buyerId: userId,
          isAdminChat: true,
          status: 'ACTIVE',
          auctionId: null 
        },
        include: {
          seller: { select: { id: true, ingameName: true } },
          buyer: { select: { id: true, ingameName: true } }
        }
      });
    }

    res.json(room);
  } catch (error) {
    res.status(500).json({ error: "관리자 채팅방 연결 실패" });
  }
});

/**
 * [PATCH] 거래 종료 (Finish 버튼 대응)
 * 💡 트랜잭션을 통해 평점 반영과 방 종료를 동시에 처리
 */
router.patch('/rooms/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const room = await prisma.chatRoom.findUnique({
      where: { id: parseInt(id) }
    });

    if (!room) return res.status(404).json({ error: "방을 찾을 수 없습니다." });

    // 💡 평점 시스템 반영 (상대방 찾기)
    const targetId = room.sellerId === userId ? room.buyerId : room.sellerId;

    await prisma.$transaction(async (tx) => {
      // 1. 상대방 평점 및 거래 횟수 업데이트
      const targetUser = await tx.user.findUnique({ where: { id: targetId } });
      if (targetUser) {
        const newReviewCount = targetUser.reviewCount + 1;
        // 기본 평점 5.0 부여 (추후 입력받는 구조로 확장 가능)
        const newScore = ((targetUser.reputationScore * targetUser.reviewCount) + 5) / newReviewCount;

        await tx.user.update({
          where: { id: targetId },
          data: { 
            reputationScore: newScore, 
            reviewCount: newReviewCount,
            successfulTrades: { increment: 1 }
          }
        });
      }

      // 2. 채팅방 상태 변경 (ACTIVE -> ARCHIVED)
      await tx.chatRoom.update({
        where: { id: parseInt(id) },
        data: { status: 'ARCHIVED' }
      });
    });

    res.json({ message: "거래가 안전하게 종료되었습니다." });
  } catch (error) {
    console.error("Finish Error:", error);
    res.status(500).json({ error: "거래 종료 처리 실패" });
  }
});

/**
 * [POST] 유저 신고 접수
 */
router.post('/rooms/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    const { targetId, reason } = req.body;
    const reporterId = req.user.id;

    if (!reason) return res.status(400).json({ error: "신고 사유를 입력해주세요." });

    const report = await prisma.report.create({
      data: {
        roomId: parseInt(id),
        reporterId: reporterId,
        targetId: parseInt(targetId),
        reason: reason,
        isResolved: false
      }
    });

    res.status(201).json({ message: "신고가 접수되었습니다.", reportId: report.id });
  } catch (error) {
    res.status(500).json({ error: "신고 접수 실패" });
  }
});

/**
 * [GET] 특정 채팅방 메시지 조회
 */
router.get('/rooms/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await prisma.message.findMany({
      where: { roomId: parseInt(id) },
      include: { sender: { select: { id: true, ingameName: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "메시지 로드 실패" });
  }
});

module.exports = router;