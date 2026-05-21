import prisma from "../../db.js";

export const listSupportRooms = () =>
  prisma.chatRoom.findMany({
    where: { isAdminChat: true },
    include: {
      buyer: { select: { id: true, ingameName: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

export const deleteSupportRoom = (roomId) =>
  prisma.$transaction([
    prisma.message.deleteMany({ where: { roomId } }),
    prisma.report.deleteMany({ where: { roomId } }),
    prisma.chatRoom.delete({ where: { id: roomId } }),
  ]);
