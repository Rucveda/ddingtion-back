import prisma from "../../db.js";
import { submitTradeRoomReport } from "../../domain/trade/tradeReport.js";
import { ChatServiceError } from "./chatErrors.js";
import { includeRoomRelations } from "./chatShared.js";

export const confirmTradeClose = async (roomId, userId) => {
  const parsedId = parseInt(roomId, 10);
  const room = await prisma.chatRoom.findUnique({
    where: { id: parsedId },
    include: { auction: true },
  });

  if (!room) {
    throw new ChatServiceError("방을 찾을 수 없습니다.", 404);
  }
  if (room.sellerId !== userId && room.buyerId !== userId) {
    throw new ChatServiceError("권한이 없습니다.", 403);
  }
  if (room.isAdminChat || !room.auctionId || !room.auction) {
    throw new ChatServiceError("거래 확정 대상이 아닙니다.", 400);
  }
  if (room.status !== "ACTIVE") {
    throw new ChatServiceError("이미 종료된 거래입니다.", 400);
  }
  if ((room.sellerId === userId && room.sellerConfirmed) || (room.buyerId === userId && room.buyerConfirmed)) {
    return {
      completed: false,
      message: "이미 거래 확정을 완료했습니다. 상대방의 확정을 기다리고 있습니다.",
      room,
    };
  }

  const nextSellerConfirmed = room.sellerConfirmed || room.sellerId === userId;
  const nextBuyerConfirmed = room.buyerConfirmed || room.buyerId === userId;

  if (!nextSellerConfirmed || !nextBuyerConfirmed) {
    const partnerId = room.sellerId === userId ? room.buyerId : room.sellerId;
    const updatedRoom = await prisma.chatRoom.update({
      where: { id: parsedId },
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

    return {
      completed: false,
      message: "거래 확정이 기록되었습니다. 상대방의 확정을 기다리고 있습니다.",
      room: updatedRoom,
    };
  }

  const completedRoom = await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.update({
      where: { id: room.auctionId },
      data: { status: "COMPLETED" },
    });

    await tx.marketHistory.create({
      data: {
        auctionId: auction.id,
        itemId: auction.itemId,
        price: auction.currentPrice,
        enhancementLevel: auction.enhancementLevel,
        enhancementRank: auction.enhancementRank,
        quality: auction.quality,
        lampLines: auction.lampLines,
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
      where: { id: parsedId },
      data: {
        status: "ARCHIVED",
        sellerConfirmed: true,
        buyerConfirmed: true,
      },
      include: includeRoomRelations,
    });
  });

  return {
    completed: true,
    message: "양측 거래 확정이 완료되었습니다.",
    room: completedRoom,
  };
};

export const submitRoomReport = async ({ roomId, reporterId, targetId, reason }) => {
  if (Number.isNaN(roomId)) {
    throw new ChatServiceError("유효하지 않은 채팅방입니다.", 400);
  }
  if (!reason?.trim()) {
    throw new ChatServiceError("신고 사유를 입력해주세요.", 400);
  }
  if (!targetId) {
    throw new ChatServiceError("신고 대상을 지정해주세요.", 400);
  }

  try {
    const { report } = await submitTradeRoomReport({
      roomId,
      reporterId,
      targetId: parseInt(targetId, 10),
      reason: reason.trim(),
    });
    return report;
  } catch (error) {
    if (error.status) {
      throw new ChatServiceError(error.message, error.status, error.code);
    }
    throw error;
  }
};
