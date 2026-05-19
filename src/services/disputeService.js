import prisma from "../db.js";
import { removeAuctionQueueJobs } from "../lib/auctionCancel.js";

export const expireAuctionForDispute = async (auctionId) => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) return null;

  await removeAuctionQueueJobs(auctionId);

  if (auction.status === "EXPIRED" || auction.status === "CANCELED") {
    return auction;
  }

  return prisma.auction.update({
    where: { id: auctionId },
    data: { status: "EXPIRED" },
  });
};

export const applyDisputeAdminAction = async ({ reportId, action, adminNote }) => {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      room: {
        include: {
          auction: {
            include: {
              bids: { orderBy: { bidAmount: "desc" }, take: 1 },
              item: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    const err = new Error("신고를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  const auction = report.room?.auction;
  const auctionId = report.auctionId || report.room?.auctionId;

  if (!auctionId || !auction) {
    const err = new Error("연결된 경매가 없습니다.");
    err.status = 400;
    throw err;
  }

  let auctionUpdate = null;

  switch (action) {
    case "restore_active": {
      if (new Date(auction.endTime).getTime() <= Date.now()) {
        const err = new Error("마감 시각이 지나 복구할 수 없습니다. 종료 시각을 연장한 뒤 시도하세요.");
        err.status = 400;
        throw err;
      }
      auctionUpdate = await prisma.auction.update({
        where: { id: auctionId },
        data: { status: "ACTIVE" },
      });
      break;
    }
    case "restore_pending_trade": {
      const lastBid = auction.bids?.[0];
      if (!lastBid) {
        const err = new Error("낙찰 입찰이 없어 거래 중 상태로 복구할 수 없습니다.");
        err.status = 400;
        throw err;
      }
      auctionUpdate = await prisma.$transaction(async (tx) => {
        const updated = await tx.auction.update({
          where: { id: auctionId },
          data: { status: "PENDING_TRADE", currentPrice: lastBid.bidAmount },
        });
        const existingRoom = await tx.chatRoom.findUnique({ where: { auctionId } });
        if (!existingRoom) {
          await tx.chatRoom.create({
            data: {
              auctionId,
              sellerId: auction.sellerId,
              buyerId: lastBid.bidderId,
              isAdminChat: false,
            },
          });
        }
        return updated;
      });
      break;
    }
    case "force_complete": {
      const lastBid = auction.bids?.[0];
      if (!lastBid) {
        const err = new Error("입찰 기록이 없어 거래 완료 처리할 수 없습니다.");
        err.status = 400;
        throw err;
      }
      auctionUpdate = await prisma.auction.update({
        where: { id: auctionId },
        data: { status: "COMPLETED", currentPrice: lastBid.bidAmount },
      });
      break;
    }
    case "keep_expired":
      auctionUpdate = auction;
      break;
    default: {
      const err = new Error("지원하지 않는 분쟁 처리 액션입니다.");
      err.status = 400;
      throw err;
    }
  }

  const updatedReport = await prisma.report.update({
    where: { id: reportId },
    data: {
      isResolved: true,
      disputeAction: action,
      adminNote: adminNote ? String(adminNote).slice(0, 2000) : null,
    },
  });

  return { report: updatedReport, auction: auctionUpdate };
};
