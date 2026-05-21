import prisma from "../../db.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export const attachChatHandlers = (io, socket, { redisConnection, clientIp }) => {
  socket.on("join_room", async (data) => {
    try {
      const { roomId, token } = data;
      if (!token) throw new Error("인증 토큰 누락");
      const decodedUser = jwt.verify(token, env.JWT_SECRET);

      const pRoomId = parseInt(roomId, 10);
      const pUserId = parseInt(decodedUser.id, 10);
      if (Number.isNaN(pRoomId) || Number.isNaN(pUserId)) return;

      socket.join(`chat_${pRoomId}`);

      await prisma.message.updateMany({
        where: { roomId: pRoomId, senderId: { not: pUserId }, isRead: false },
        data: { isRead: true },
      });
      io.to(`chat_${pRoomId}`).emit("messages_read", { roomId: pRoomId, userId: pUserId });

      const room = await prisma.chatRoom.findUnique({ where: { id: pRoomId } });
      if (room) {
        io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit("refresh_chat_rooms");
      }
    } catch (err) {
      console.error("채팅방 입장/읽음 처리 오류:", err.message);
    }
  });

  socket.on("send_message", async (data) => {
    try {
      const { roomId, token, content } = data;
      if (!token) throw new Error("인증 토큰 누락");
      const decodedUser = jwt.verify(token, env.JWT_SECRET);

      const pRoomId = parseInt(roomId, 10);
      const pSenderId = parseInt(decodedUser.id, 10);

      await redisConnection.set(`user_ip:${pSenderId}`, clientIp, "EX", 86400);

      if (Number.isNaN(pRoomId) || Number.isNaN(pSenderId)) return;

      if (!content || content.trim() === "") throw new Error("빈 메시지는 전송할 수 없습니다.");

      const rateKey = `ratelimit:chat:${pSenderId}`;
      const msgCount = await redisConnection.incr(rateKey);
      if (msgCount === 1) await redisConnection.expire(rateKey, 2);
      if (msgCount > 3) {
        throw new Error("메시지 전송이 너무 빠릅니다. 도배 방지를 위해 잠시 후 시도해주세요.");
      }

      const room = await prisma.chatRoom.findUnique({ where: { id: pRoomId } });
      if (!room || (room.sellerId !== pSenderId && room.buyerId !== pSenderId && decodedUser.role !== "ADMIN")) {
        throw new Error("채팅방 전송 권한 없음");
      }

      const newMessage = await prisma.message.create({
        data: { roomId: pRoomId, senderId: pSenderId, content, isRead: false },
        include: { sender: { select: { id: true, ingameName: true } } },
      });

      io.to(`chat_${pRoomId}`).emit("new_message", newMessage);
      io.to(`user_${room.sellerId}`).to(`user_${room.buyerId}`).emit("refresh_chat_rooms");
    } catch (err) {
      console.error("메시지 저장 실패:", err.message);
    }
  });
};
