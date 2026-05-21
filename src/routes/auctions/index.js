import express from "express";
import { createRedisClient } from "../../lib/redis.js";
import { getAuctionQueue } from "../../lib/auctionQueueJobs.js";
import marketRoutes from "./market.js";
import commentsRoutes from "./comments.js";
import queryRoutes from "./query.js";
import createTradeRouter from "./trade.js";

const router = express.Router();
const redisConnection = createRedisClient();
const auctionQueue = getAuctionQueue();

router.use(marketRoutes);
router.use(commentsRoutes);
router.use(queryRoutes);
router.use(createTradeRouter({ redisConnection, auctionQueue }));

export default router;
