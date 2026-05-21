import authRoutes from "./auth.js";
import auctionRoutes from "./auctions.js";
import adminRoutes from "./admin.js";
import chatRoutes from "./chat.js";
import notificationRoutes from "./notifications.js";
import reviewRoutes from "./reviews.js";
import postsRoutes from "./posts.js";

/** Express app에 /api/* 라우터를 등록 (경로·핸들러 계약 유지) */
export const mountApiRoutes = (app) => {
  app.use("/api/auth", authRoutes);
  app.use("/api/auctions", auctionRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reviews", reviewRoutes);
  app.use("/api/posts", postsRoutes);
};
