import express from 'express';
import authenticateToken from '../middlewares/authMiddleware.js';
import { Queue } from 'bullmq';
import { createRedisClient } from '../lib/redis.js';
import { buildMarketAnalysis, parseMarketAnalysisOptions } from '../services/marketAnalysisService.js';
import { AuctionServiceError, buyNowAuction, createAuctionListing } from '../services/auctionTradeService.js';
import { getActiveAuctions, getAuctionDetail, getAuctionItems, getCompletedHistory } from '../services/auctionQueryService.js';

const router = express.Router();

/**
 * 🛠️ [Redis 연결]
 */
const redisConnection = createRedisClient();

const auctionQueue = new Queue('auctionQueue', { connection: redisConnection });

// --- 🌐 [Router] API 엔드포인트 ---

router.get('/items', authenticateToken, async (req, res) => {
    try {
        const items = await getAuctionItems();
        res.json(items);
    } catch (error) {
        res.status(500).json([]);
    }
});

router.get('/market-analysis/:itemId', async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId);
        if (isNaN(itemId)) return res.status(400).json({ error: "유효하지 않은 아이템 ID" });
        const parsedOptions = parseMarketAnalysisOptions(req.query);
        const analysis = await buildMarketAnalysis(itemId, parsedOptions);
        res.json(analysis);
    } catch (error) {
        res.status(500).json({ error: "분석 생성 실패" });
    }
});

router.get('/completed', async (req, res) => {
    try {
        const itemId = parseInt(req.query.itemId);
        const limit = parseInt(req.query.limit) || 5;

        if (isNaN(itemId)) {
            return res.status(400).json({ error: "아이템 ID가 필요합니다." });
        }

        const safeData = await getCompletedHistory({ itemId, limit });
        res.json(safeData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "기록 조회 실패" });
    }
});

router.get('/', async (req, res) => {
    try {
        const safeData = await getActiveAuctions();
        res.status(200).json(Array.isArray(safeData) ? safeData : []);
    } catch (error) {
        res.status(200).json([]);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const auctionId = parseInt(req.params.id);
        if (isNaN(auctionId)) return res.status(400).json({ error: "유효하지 않은 경매 ID" });

        const auction = await getAuctionDetail(auctionId);

        if (!auction) return res.status(404).json({ error: "경매 없음" });
        res.json(auction);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "조회 실패" });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const newAuction = await createAuctionListing({
            userId: req.user.id,
            body: req.body,
            redisConnection,
            auctionQueue,
            clientIp,
        });
        res.status(201).json({
            ...newAuction,
            id: newAuction.id.toString(),
            startPrice: newAuction.startPrice.toString(),
            currentPrice: newAuction.currentPrice.toString(),
        });
    } catch (error) {
        if (error instanceof AuctionServiceError) {
            return res.status(error.status).json({ error: error.message });
        }
        res.status(500).json({ error: "등록 실패" });
    }
});

router.post('/:id/buy', authenticateToken, async (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const auctionId = parseInt(req.params.id);
        const result = await buyNowAuction({
            auctionId,
            user: req.user,
            redisConnection,
            auctionQueue,
            clientIp,
        });
        res.json({ message: "완료", roomId: result.roomId });
    } catch (error) {
        console.error("Buy Now Error:", error);
        if (error instanceof AuctionServiceError) {
            return res.status(error.status).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || "처리 실패" });
    }
});

export default router;