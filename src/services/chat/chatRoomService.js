import prisma from "../../db.js";
import { ChatServiceError } from "./chatErrors.js";

export const listActiveRooms = (userId) =>
  prisma.chatRoom.findMany({
    where: {
      OR: [{ sellerId: userId }, { buyerId: userId }],
      status: "ACTIVE",
      isAdminChat: false,
    },
    include: {
      seller: { select: { id: true, ingameName: true, reputationScore: true } },
      buyer: { select: { id: true, ingameName: true, reputationScore: true } },
      auction: { select: { id: true, status: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          messages: {
            where: { isRead: false, senderId: { not: userId } },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

export const getOrCreateAdminSupportRoom = async (userId) => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!admin) {
    throw new ChatServiceError("응대 가능한 관리자가 없습니다.", 404);
  }
  if (admin.id === userId) {
    throw new ChatServiceError("관리자 본인은 사용할 수 없습니다.", 400);
  }

  let room = await prisma.chatRoom.findFirst({
    where: {
      buyerId: userId,
      isAdminChat: true,
      status: "ACTIVE",
    },
    include: {
      seller: { select: { id: true, ingameName: true } },
      buyer: { select: { id: true, ingameName: true } },
    },
  });

  if (!room) {
    room = await prisma.chatRoom.create({
      data: {
        sellerId: admin.id,
        buyerId: userId,
        isAdminChat: true,
        status: "ACTIVE",
        auctionId: null,
      },
      include: {
        seller: { select: { id: true, ingameName: true } },
        buyer: { select: { id: true, ingameName: true } },
      },
    });
  }

  return room;
};

export const getRoomMessages = async (roomId, userId, userRole) => {
  const parsedId = parseInt(roomId, 10);
  const room = await prisma.chatRoom.findUnique({ where: { id: parsedId } });
  if (!room || (room.sellerId !== userId && room.buyerId !== userId && userRole !== "ADMIN")) {
    throw new ChatServiceError("채팅방 접근 권한이 없습니다.", 403);
  }

  return prisma.message.findMany({
    where: { roomId: parsedId },
    include: { sender: { select: { id: true, ingameName: true } } },
    orderBy: { createdAt: "asc" },
  });
};
