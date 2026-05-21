import prisma from "../../db.js";
import { removeAuctionQueueJobs } from "../auction/auctionCancel.js";

/**
 * 거래 채팅 중 신고 접수: 연결 경매를 유찰(EXPIRED) 처리하고 채팅방을 종료(ARCHIVED)합니다.
 * (낙찰 후 PENDING_TRADE 단계에서만 발생한다고 가정)
 */
export const submitTradeRoomReport = async ({ roomId, reporterId, targetId, reason }) => {
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      auction: { select: { id: true, status: true, item: { select: { name: true } } } },
    },
  });

  if (!room) {
    const err = new Error("방을 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  if (room.isAdminChat || !room.auctionId) {
    const err = new Error("거래 채팅방에서만 신고할 수 있습니다.");
    err.status = 400;
    throw err;
  }
  if (room.sellerId !== reporterId && room.buyerId !== reporterId) {
    const err = new Error("신고 권한이 없습니다.");
    err.status = 403;
    throw err;
  }

  const existing = await prisma.report.findFirst({ where: { roomId } });
  if (existing) {
    const err = new Error("이 거래에 대한 신고가 이미 접수되었습니다.");
    err.status = 409;
    err.code = "REPORT_ALREADY_EXISTS";
    throw err;
  }

  const auction = room.auction;
  if (!auction || auction.status !== "PENDING_TRADE") {
    const err = new Error("거래 진행 중인 경매에서만 신고할 수 있습니다.");
    err.status = 400;
    throw err;
  }

  const report = await prisma.$transaction(async (tx) => {
    await tx.auction.update({
      where: { id: room.auctionId },
      data: { status: "EXPIRED" },
    });

    await tx.chatRoom.update({
      where: { id: roomId },
      data: { status: "ARCHIVED" },
    });

    return tx.report.create({
      data: {
        roomId,
        auctionId: room.auctionId,
        reporterId,
        targetId,
        reason,
        isResolved: false,
        previousAuctionStatus: auction.status,
      },
    });
  });

  await removeAuctionQueueJobs(room.auctionId);

  return { report, auction };
};
