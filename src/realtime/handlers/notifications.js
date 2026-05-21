export const attachNotificationHandlers = (socket) => {
  socket.on("setup_notifications", (userId) => {
    if (!userId || userId === "null" || userId === "undefined") {
      return console.warn(`⚠️ 유효하지 않은 유저 ID 알림 구독 시도 차단: ${userId}`);
    }
    socket.join(`user_${userId}`);
    console.log(`🔔 유저 ${userId} 알림 채널 구독 완료`);
  });
};
