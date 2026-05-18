import express from 'express';
import authenticateToken from '../middlewares/authMiddleware.js';
import { checkDiscordLinked } from '../middlewares/discordCheck.js';
import { Queue } from 'bullmq';
import { createRedisClient } from '../lib/redis.js';
import prisma from '../db.js';
import { buildMarketAnalysis, parseMarketAnalysisOptions } from '../services/marketAnalysisService.js';
import { AuctionServiceError, buyNowAuction, createAuctionListing, relistAuction } from '../services/auctionTradeService.js';
import { getActiveAuctions, getAuctionDetail, getAuctionItems, getCompletedHistory, getUserAuctions, getUserBidAuctions } from '../services/auctionQueryService.js';

const router = express.Router();
const MARKET_ANALYSIS_CACHE_TTL_MS = 60 * 1000;
const marketAnalysisCache = new Map();

const getStableQueryKey = (query) =>
    Object.keys(query)
        .sort()
        .map((key) => `${key}:${query[key]}`)
        .join('|');

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
        const bypassCache = req.query.fresh === "1" || req.query.noCache === "1";
        const cacheTtlMs = req.query.cacheTtl === "4" ? 4 * 1000 : MARKET_ANALYSIS_CACHE_TTL_MS;
        const cacheMaxAge = Math.max(0, Math.floor(cacheTtlMs / 1000));
        const cacheKey = `${itemId}:${getStableQueryKey(req.query)}`;
        const cached = marketAnalysisCache.get(cacheKey);
        if (!bypassCache && cached && Date.now() - cached.createdAt < cacheTtlMs) {
            res.set('Cache-Control', `private, max-age=${cacheMaxAge}`);
            return res.json(cached.analysis);
        }

        const parsedOptions = parseMarketAnalysisOptions(req.query);
        const analysis = await buildMarketAnalysis(itemId, parsedOptions);
        if (!bypassCache) {
            marketAnalysisCache.set(cacheKey, { analysis, createdAt: Date.now() });
            if (marketAnalysisCache.size > 300) {
                const oldestKey = marketAnalysisCache.keys().next().value;
                marketAnalysisCache.delete(oldestKey);
            }
        }
        res.set('Cache-Control', bypassCache ? 'no-store' : `private, max-age=${cacheMaxAge}`);
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

router.get('/my-bids', authenticateToken, async (req, res) => {
    try {
        const safeData = await getUserBidAuctions(req.user.id);
        res.status(200).json(Array.isArray(safeData) ? safeData : []);
    } catch (error) {
        console.error(error);
        res.status(200).json([]);
    }
});

router.get('/my-auctions', authenticateToken, async (req, res) => {
    try {
        const safeData = await getUserAuctions(req.user.id);
        res.status(200).json(Array.isArray(safeData) ? safeData : []);
    } catch (error) {
        console.error(error);
        res.status(200).json([]);
    }
});

router.get('/:id/comments', async (req, res) => {
    try {
        const auctionId = parseInt(req.params.id);
        if (isNaN(auctionId)) return res.status(400).json({ error: "유효하지 않은 경매 ID" });

        const comments = await prisma.auctionComment.findMany({
            where: { auctionId },
            orderBy: { createdAt: 'asc' },
            take: 100,
            include: {
                author: { select: { id: true, ingameName: true, reputationScore: true } }
            }
        });

        res.json(comments);
    } catch (error) {
        console.error(error);
        res.status(500).json([]);
    }
});

router.post('/:id/comments', authenticateToken, async (req, res) => {
    try {
        const auctionId = parseInt(req.params.id);
        const content = String(req.body?.content || "").trim();

        if (isNaN(auctionId)) return res.status(400).json({ error: "유효하지 않은 경매 ID" });
        if (!content) return res.status(400).json({ error: "댓글 내용을 입력해주세요." });
        if (content.length > 500) return res.status(400).json({ error: "댓글은 500자 이하로 입력해주세요." });

        const auction = await prisma.auction.findUnique({
            where: { id: auctionId },
            select: { id: true, sellerId: true, item: { select: { name: true } } }
        });
        if (!auction) return res.status(404).json({ error: "경매 없음" });

        const comment = await prisma.auctionComment.create({
            data: { auctionId, authorId: req.user.id, content },
            include: {
                author: { select: { id: true, ingameName: true, reputationScore: true } }
            }
        });

        if (auction.sellerId !== req.user.id) {
            await prisma.notification.create({
                data: {
                    userId: auction.sellerId,
                    type: "COMMENT",
                    message: `[${auction.item.name}] 경매에 새 댓글이 등록되었습니다.`,
                    link: `/auction/${auctionId}`
                }
            });
        }

        res.status(201).json(comment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "댓글 등록 실패" });
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

router.post('/:id/relist', authenticateToken, async (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const auctionId = parseInt(req.params.id);
        if (isNaN(auctionId)) return res.status(400).json({ error: "유효하지 않은 경매 ID" });

        const newAuction = await relistAuction({
            auctionId,
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
        console.error("Relist Error:", error);
        res.status(500).json({ error: "재등록 실패" });
    }
});

router.post('/:id/buy', authenticateToken, checkDiscordLinked, async (req, res) => {
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