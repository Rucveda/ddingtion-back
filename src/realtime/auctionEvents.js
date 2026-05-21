import { createRedisClient } from "../lib/redis.js";

const AUCTION_EVENTS_CHANNEL = "auction-events";

export const attachAuctionEventSubscriber = (io) => {
  const subscriber = createRedisClient();

  subscriber.subscribe(AUCTION_EVENTS_CHANNEL, (err) => {
    if (err) {
      console.error("❌ Redis 구독 실패:", err);
    } else {
      console.log(`✅ Redis 채널 구독 성공: ${AUCTION_EVENTS_CHANNEL}`);
    }
  });

  subscriber.on("message", (channel, message) => {
    if (channel === AUCTION_EVENTS_CHANNEL) {
      const data = JSON.parse(message);
      io.to(`auction_${data.auctionId}`).emit("auction_finished", data);
      io.emit("refresh_chat_rooms");
    }
  });

  return subscriber;
};
