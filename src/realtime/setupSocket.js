import { createRedisClient } from "../lib/redis.js";
import { getSocketClientIp } from "../lib/strictIpBan.js";
import { attachAuctionEventSubscriber } from "./auctionEvents.js";
import { attachNotificationHandlers } from "./handlers/notifications.js";
import { attachAuctionBidHandlers } from "./handlers/auctionBids.js";
import { attachChatHandlers } from "./handlers/chat.js";

const setupSocket = (io) => {
  attachAuctionEventSubscriber(io);
  const redisConnection = createRedisClient();

  io.on("connection", (socket) => {
    console.log("유저 접속:", socket.id);
    const clientIp = getSocketClientIp(socket);
    const ctx = { redisConnection, clientIp };

    attachNotificationHandlers(socket);
    attachAuctionBidHandlers(io, socket, ctx);
    attachChatHandlers(io, socket, ctx);

    socket.on("disconnect", () => {
      console.log("유저 접속 종료:", socket.id);
    });
  });
};

export default setupSocket;
