import { RateLimitError } from "../../lib/rateLimit.js";
import { AuctionServiceError } from "../../services/auctionTradeService.js";

export const sendAuctionError = (res, error, fallbackMessage) => {
  if (error instanceof AuctionServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof RateLimitError) {
    return res.status(error.status).json({
      code: "RATE_LIMITED",
      error: error.message,
      retryAfterSec: error.retryAfterSec,
    });
  }
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
};

export const handleAuctionRoute = (handler, fallbackMessage) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendAuctionError(res, error, fallbackMessage);
  }
};

export const serializeAuctionResponse = (auction) => ({
  ...auction,
  id: auction.id.toString(),
  startPrice: auction.startPrice.toString(),
  currentPrice: auction.currentPrice.toString(),
});

export const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
