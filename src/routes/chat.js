import express from 'express';
const router = express.Router();
import authenticateToken from '../middlewares/authMiddleware.js';
import { checkDiscordLinked } from '../middlewares/discordCheck.js';
import { rejectBannedAccount } from '../middlewares/accessGuards.js';
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
        isAdminChat: true,
        status: 'ACTIVE' // 💡 어뷰징 방어: 이미 활성화된 문의방이 있는지 확인하여 중복 생성 차단
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

const includeRoomRelations = {
  seller: { select: { id: true, ingameName: true, reputationScore: true } },
  buyer: { select: { id: true, ingameName: true, reputationScore: true } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1 },
  _count: {
    select: {
      messages: true
    }
  }
};

const emitTradeRoomUpdate = (req, room) => {
  const io = req.app.get('io');
  if (!io || !room) return;
  io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit('refresh_chat_rooms');
  io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit('room_updated', { room });
};

/**
 * [PATCH] 거래 확정
 * 한쪽만 확정하면 대기 상태를 유지하고, 양측 확정 시 경매 완료 및 시세 반영.
 */
router.patch('/rooms/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const room = await prisma.chatRoom.findUnique({
      where: { id: parseInt(id) },
      include: { auction: true }
    });

    if (!room) return res.status(404).json({ error: "방을 찾을 수 없습니다." });

    // 💡 보안 패치: 본인이 속한 채팅방이 아니면 조작할 수 없도록 방어
    if (room.sellerId !== userId && room.buyerId !== userId) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    if (room.isAdminChat || !room.auctionId || !room.auction) {
      return res.status(400).json({ error: "거래 확정 대상이 아닙니다." });
    }
    if (room.status !== 'ACTIVE') {
      return res.status(400).json({ error: "이미 종료된 거래입니다." });
    }
    if ((room.sellerId === userId && room.sellerConfirmed) || (room.buyerId === userId && room.buyerConfirmed)) {
      return res.json({
        completed: false,
        message: "이미 거래 확정을 완료했습니다. 상대방의 확정을 기다리고 있습니다.",
        room,
      });
    }

    const nextSellerConfirmed = room.sellerConfirmed || room.sellerId === userId;
    const nextBuyerConfirmed = room.buyerConfirmed || room.buyerId === userId;

    if (!nextSellerConfirmed || !nextBuyerConfirmed) {
      const partnerId = room.sellerId === userId ? room.buyerId : room.sellerId;
      const updatedRoom = await prisma.chatRoom.update({
        where: { id: parseInt(id) },
        data: {
          sellerConfirmed: nextSellerConfirmed,
          buyerConfirmed: nextBuyerConfirmed,
        },
        include: includeRoomRelations,
      });

      await prisma.notification.create({
        data: {
          userId: partnerId,
          type: "TRADE",
          message: "상대방이 거래를 확정했습니다. 거래 내용을 확인한 뒤 확정해주세요.",
          link: `/auction/${room.auctionId}`,
        },
      });

      emitTradeRoomUpdate(req, updatedRoom);

      return res.json({
        completed: false,
        message: "거래 확정이 기록되었습니다. 상대방의 확정을 기다리고 있습니다.",
        room: updatedRoom,
      });
    }

    const completedRoom = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.update({
        where: { id: room.auctionId },
        data: { status: 'COMPLETED' },
      });

      await tx.marketHistory.create({
        data: {
          auctionId: auction.id,
          itemId: auction.itemId,
          price: auction.currentPrice,
          enhancementLevel: auction.enhancementLevel,
          enhancementRank: auction.enhancementRank,
          enchantments: auction.enchantments,
          imprint: auction.imprint,
          skills: auction.skills,
          runes: auction.runes,
          isValid: true,
        },
      });

      await tx.user.update({ where: { id: room.sellerId }, data: { successfulTrades: { increment: 1 } } });
      await tx.user.update({ where: { id: room.buyerId }, data: { successfulTrades: { increment: 1 } } });

      await tx.notification.createMany({
        data: [
          {
            userId: room.sellerId,
            type: "TRADE",
            message: "거래가 완료되었습니다. 상대방 평가를 남겨주세요.",
            link: `/auction/${room.auctionId}`,
          },
          {
            userId: room.buyerId,
            type: "TRADE",
            message: "거래가 완료되었습니다. 상대방 평가를 남겨주세요.",
            link: `/auction/${room.auctionId}`,
          },
        ],
      });

      return tx.chatRoom.update({
        where: { id: parseInt(id) },
        data: {
          status: 'ARCHIVED',
          sellerConfirmed: true,
          buyerConfirmed: true,
        },
        include: includeRoomRelations,
      });
    });

    emitTradeRoomUpdate(req, completedRoom);

    res.json({ completed: true, message: "양측 거래 확정이 완료되었습니다.", room: completedRoom });
  } catch (error) {
    console.error("Finish Error:", error);
    res.status(500).json({ error: "거래 확정 처리 실패" });
  }
});

/**
 * [POST] 유저 신고 접수
 */
router.post('/rooms/:id/report', rejectBannedAccount, checkDiscordLinked, async (req, res) => {
  try {
    const roomId = parseInt(req.params.id, 10);
    const { targetId, reason } = req.body;
    const reporterId = req.user.id;

    if (isNaN(roomId)) return res.status(400).json({ error: "유효하지 않은 채팅방입니다." });
    if (!reason?.trim()) return res.status(400).json({ error: "신고 사유를 입력해주세요." });
    if (!targetId) return res.status(400).json({ error: "신고 대상을 지정해주세요." });

    const { submitTradeRoomReport } = await import("../lib/tradeReport.js");
    const { report } = await submitTradeRoomReport({
      roomId,
      reporterId,
      targetId: parseInt(targetId, 10),
      reason: reason.trim(),
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("refresh_chat_rooms");
      io.to(`user_${reporterId}`).emit("trade_report_submitted", { roomId, reportId: report.id });
    }

    res.status(201).json({
      message: "신고가 접수되었습니다. 해당 거래는 유찰 처리되었으며, 운영팀이 내용을 확인합니다.",
      reportId: report.id,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        code: error.code,
        error: error.message,
      });
    }
    console.error("Report error:", error);
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