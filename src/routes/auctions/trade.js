import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import { checkDiscordLinked } from "../../middlewares/discordCheck.js";
import { rejectBannedAccount } from "../../middlewares/accessGuards.js";
import { requestSellerCancel, revokeSellerCancel } from "../../domain/auction/auctionCancel.js";
import {
  AuctionServiceError,
  buyNowAuction,
  createAuctionListing,
  relistAuction,
} from "../../services/auctionTradeService.js";
import { handleAuctionRoute, getClientIp, serializeAuctionResponse } from "./auctionRouteHelpers.js";

const createTradeRouter = ({ redisConnection, auctionQueue }) => {
  const router = express.Router();
  const guards = [authenticate, rejectBannedAccount, checkDiscordLinked];

  router.post(
    "/",
    ...guards,
    handleAuctionRoute(async (req, res) => {
      const newAuction = await createAuctionListing({
        userId: req.user.id,
        body: req.body,
        redisConnection,
        auctionQueue,
        clientIp: getClientIp(req),
      });
      res.status(201).json(serializeAuctionResponse(newAuction));
    }, "등록 실패"),
  );

  router.post(
    "/:id/relist",
    ...guards,
    handleAuctionRoute(async (req, res) => {
      const auctionId = parseInt(req.params.id, 10);
      if (Number.isNaN(auctionId)) {
        throw new AuctionServiceError("유효하지 않은 경매 ID", 400);
      }
      const newAuction = await relistAuction({
        auctionId,
        userId: req.user.id,
        body: req.body,
        redisConnection,
        auctionQueue,
        clientIp: getClientIp(req),
      });
      res.status(201).json(serializeAuctionResponse(newAuction));
    }, "재등록 실패"),
  );

  router.post(
    "/:id/buy",
    ...guards,
    handleAuctionRoute(async (req, res) => {
      const result = await buyNowAuction({
        auctionId: parseInt(req.params.id, 10),
        user: req.user,
        redisConnection,
        auctionQueue,
        clientIp: getClientIp(req),
      });
      res.json({ message: "완료", roomId: result.roomId });
    }, "처리 실패"),
  );

  router.post(
    "/:id/cancel-request",
    ...guards,
    handleAuctionRoute(async (req, res) => {
      const auctionId = parseInt(req.params.id, 10);
      if (Number.isNaN(auctionId)) {
        throw new AuctionServiceError("유효하지 않은 경매 ID", 400);
      }
      const result = await requestSellerCancel({
        auctionId,
        sellerId: req.user.id,
      });
      res.json({
        message: "취소 요청이 접수되었습니다. 5분 후 유찰 처리됩니다.",
        status: result.auction.status,
        cancelRequestedAt: result.cancelRequestedAt,
        finalizeAt: result.finalizeAt,
      });
    }, "취소 요청 실패"),
  );

  router.post(
    "/:id/cancel-revoke",
    ...guards,
    handleAuctionRoute(async (req, res) => {
      const auctionId = parseInt(req.params.id, 10);
      if (Number.isNaN(auctionId)) {
        throw new AuctionServiceError("유효하지 않은 경매 ID", 400);
      }
      const result = await revokeSellerCancel({
        auctionId,
        sellerId: req.user.id,
      });
      res.json({
        message: "취소 요청을 철회했습니다. 경매가 다시 진행됩니다.",
        status: result.auction.status,
      });
    }, "취소 철회 실패"),
  );

  return router;
};

export default createTradeRouter;
