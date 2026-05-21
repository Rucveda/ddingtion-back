export const includeRoomRelations = {
  seller: { select: { id: true, ingameName: true, reputationScore: true } },
  buyer: { select: { id: true, ingameName: true, reputationScore: true } },
  messages: { orderBy: { createdAt: "desc" }, take: 1 },
  _count: {
    select: {
      messages: true,
    },
  },
};

export const emitTradeRoomUpdate = (req, room) => {
  const io = req.app.get("io");
  if (!io || !room) return;
  io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit("refresh_chat_rooms");
  io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit("room_updated", { room });
};
