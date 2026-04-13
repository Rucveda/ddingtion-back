import express from 'express';
const router = express.Router();
import authenticateToken from '../middlewares/authMiddleware.js';
import prisma from '../db.js';

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
        },
        // 💡 누락된 기능 패치: 내가 읽지 않은 메시지 갯수를 집계하여 프론트엔드 알림 뱃지 활성화
        _count: {
          select: {
            messages: {
              where: { isRead: false, senderId: { not: userId } }
            }
          }
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

    // 💡 보안 패치: 본인이 속한 채팅방이 아니면 조작할 수 없도록 방어
    if (room.sellerId !== userId && room.buyerId !== userId) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    // 💡 패치: 평점 및 거래 횟수 조작 로직은 reviews.js로 완전히 이관
    // 여기서는 순수하게 채팅방의 상태만 종료(ARCHIVED)로 변경합니다.
    await prisma.chatRoom.update({
      where: { id: parseInt(id) },
      data: { status: 'ARCHIVED' }
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

    // 💡 보안 패치: 본인이 참여한 채팅방인지 먼저 확인
    const room = await prisma.chatRoom.findUnique({ where: { id: parseInt(id) } });
    if (!room) return res.status(404).json({ error: "방을 찾을 수 없습니다." });
    
    if (room.sellerId !== reporterId && room.buyerId !== reporterId) {
      return res.status(403).json({ error: "신고 권한이 없습니다." });
    }

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
    const userId = req.user.id;

    // 💡 보안 패치: 해당 채팅방 참여자(또는 관리자)가 아니면 메시지 열람 차단
    const room = await prisma.chatRoom.findUnique({ where: { id: parseInt(id) } });
    if (!room || (room.sellerId !== userId && room.buyerId !== userId && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ error: "채팅방 접근 권한이 없습니다." });
    }

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

export default router;