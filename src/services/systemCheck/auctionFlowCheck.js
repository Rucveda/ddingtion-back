import { randomUUID } from "crypto";
import prisma from "../../db.js";
import { createRedisClient } from "../../lib/redis.js";
import { getMinimumBid } from "../../domain/auction/bidIncrement.js";
import { finalizeActiveAuctionEnd } from "../../domain/auction/finalizeAuctionEnd.js";
import { placeBidOnAuction } from "../../domain/auction/placeBid.js";
import { getAuctionQueue } from "../../lib/auctionQueueJobs.js";
import { confirmTradeClose } from "../chat/chatTradeService.js";
import { systemCheckDescription } from "./constants.js";
import { ensureHealthCheckActors } from "./testActors.js";
import {
  createRun,
  finishRun,
  getLatestRun,
  getRun,
  setRunMeta,
  updateRunStep,
} from "./runStore.js";
import { teardownAuctionById, teardownStaleSystemCheckAuctions } from "./teardown.js";

const CHECK_ID = "auction-flow";

const STEP_DEFS = [
  { id: "actors", label: "테스트 계정 준비" },
  { id: "auction", label: "헬스체크 경매 등록" },
  { id: "bid", label: "입찰 처리" },
  { id: "finalize", label: "경매 마감 및 채팅방 생성" },
  { id: "chat", label: "채팅 메시지 저장" },
  { id: "trade", label: "양측 거래 확정" },
  { id: "teardown", label: "테스트 데이터 정리" },
];

const stepStart = (runId, stepId) => {
  updateRunStep(runId, stepId, { status: "running", message: null, startedAt: Date.now() });
};

const stepOk = (runId, stepId, message) => {
  const run = getRun(runId);
  const step = run?.steps.find((s) => s.id === stepId);
  const startedAt = step?.startedAt || Date.now();
  updateRunStep(runId, stepId, {
    status: "passed",
    message: message || "OK",
    durationMs: Date.now() - startedAt,
  });
};

const stepFail = (runId, stepId, message) => {
  const run = getRun(runId);
  const step = run?.steps.find((s) => s.id === stepId);
  const startedAt = step?.startedAt || Date.now();
  updateRunStep(runId, stepId, {
    status: "failed",
    message,
    durationMs: Date.now() - startedAt,
  });
};

const pickItemId = async () => {
  const item = await prisma.item.findFirst({ orderBy: { id: "asc" } });
  if (!item) throw new Error("DB에 아이템이 없습니다. 마켓 아이템을 먼저 등록해주세요.");
  return item.id;
};

const createSystemCheckAuction = async ({ sellerId, runId }) => {
  const itemId = await pickItemId();
  const endTime = new Date();
  endTime.setDate(endTime.getDate() + 1);

  const auction = await prisma.auction.create({
    data: {
      sellerId,
      itemId,
      startPrice: 1000n,
      currentPrice: 1000n,
      endTime,
      status: "ACTIVE",
      description: systemCheckDescription(runId),
      enhancementLevel: 0,
    },
  });

  await getAuctionQueue().add(
    "endAuction",
    { auctionId: auction.id },
    { delay: 24 * 3600000, jobId: `auction_${auction.id}` },
  );

  return auction;
};

const runAuctionFlowAsync = async (runId) => {
  let auctionId = null;
  let roomId = null;
  let redisConnection;

  try {
    await teardownStaleSystemCheckAuctions();

    stepStart(runId, "actors");
    const { seller, buyer } = await ensureHealthCheckActors();
    setRunMeta(runId, { sellerId: seller.id, buyerId: buyer.id });
    stepOk(runId, "actors", `seller #${seller.id}, buyer #${buyer.id}`);

    redisConnection = createRedisClient();

    stepStart(runId, "auction");
    const auction = await createSystemCheckAuction({ sellerId: seller.id, runId });
    auctionId = auction.id;
    setRunMeta(runId, { auctionId });
    stepOk(runId, "auction", `경매 #${auction.id} 생성`);

    stepStart(runId, "bid");
    const minimumBid = getMinimumBid(auction.currentPrice, auction.endTime);
    await placeBidOnAuction({
      auctionId: auction.id,
      bidderId: buyer.id,
      bidAmount: minimumBid.toString(),
      clientIp: "127.0.0.1",
      redisConnection,
      skipDiscordCheck: true,
    });
    stepOk(runId, "bid", `입찰가 ${minimumBid.toString()}G`);

    stepStart(runId, "finalize");
    const outcome = await finalizeActiveAuctionEnd(auction.id);
    if (outcome !== "PENDING_TRADE") {
      throw new Error(`경매 마감 결과가 예상과 다릅니다: ${outcome ?? "null"}`);
    }
    const room = await prisma.chatRoom.findUnique({ where: { auctionId: auction.id } });
    if (!room) throw new Error("채팅방이 생성되지 않았습니다.");
    roomId = room.id;
    setRunMeta(runId, { roomId });
    stepOk(runId, "finalize", `PENDING_TRADE, 채팅방 #${room.id}`);

    stepStart(runId, "chat");
    await prisma.message.create({
      data: {
        roomId: room.id,
        senderId: seller.id,
        content: `[HC:${runId}] seller ping`,
        isRead: false,
      },
    });
    await prisma.message.create({
      data: {
        roomId: room.id,
        senderId: buyer.id,
        content: `[HC:${runId}] buyer pong`,
        isRead: false,
      },
    });
    const messageCount = await prisma.message.count({ where: { roomId: room.id } });
    if (messageCount < 2) throw new Error("채팅 메시지 저장 검증 실패");
    stepOk(runId, "chat", `메시지 ${messageCount}건`);

    stepStart(runId, "trade");
    const first = await confirmTradeClose(room.id, seller.id);
    if (first.completed) throw new Error("판매자 1차 확정에서 즉시 완료됨 (비정상)");
    const second = await confirmTradeClose(room.id, buyer.id);
    if (!second.completed) throw new Error("구매자 확정 후 거래 완료되지 않음");
    const completed = await prisma.auction.findUnique({
      where: { id: auction.id },
      select: { status: true },
    });
    if (completed?.status !== "COMPLETED") {
      throw new Error(`경매 상태가 COMPLETED가 아닙니다: ${completed?.status}`);
    }
    stepOk(runId, "trade", "COMPLETED");

    stepStart(runId, "teardown");
    await teardownAuctionById(auction.id);
    auctionId = null;
    stepOk(runId, "teardown", "삭제 완료");

    finishRun(runId, { status: "passed", meta: { roomId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    const run = getRun(runId);
    const failedStep = run?.steps.find((s) => s.status === "running")?.id
      || run?.steps.find((s) => s.status === "pending")?.id
      || "unknown";
    if (failedStep !== "unknown") stepFail(runId, failedStep, message);

    try {
      stepStart(runId, "teardown");
      if (auctionId) await teardownAuctionById(auctionId);
      stepOk(runId, "teardown", "실패 후 잔여 데이터 정리");
    } catch (cleanupErr) {
      stepFail(runId, "teardown", cleanupErr instanceof Error ? cleanupErr.message : "정리 실패");
      console.error("[health-check] teardown after failure:", cleanupErr);
    }

    finishRun(runId, { status: "failed", error: message, meta: { auctionId, roomId } });
  } finally {
    if (redisConnection) {
      try {
        redisConnection.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
};

export const startAuctionFlowCheck = () => {
  const runId = randomUUID();
  const run = createRun(runId, {
    checkId: CHECK_ID,
    steps: STEP_DEFS.map((s) => ({ ...s, status: "pending", message: null, durationMs: null })),
  });

  setImmediate(() => {
    void runAuctionFlowAsync(runId);
  });

  return run;
};

export const getAuctionFlowRun = (runId) => getRun(runId);

export const getLatestAuctionFlowRun = () => getLatestRun(CHECK_ID);
