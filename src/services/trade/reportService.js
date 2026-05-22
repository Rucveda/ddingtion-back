import prisma from "../../db.js";
import { removeAuctionQueueJobs } from "../../domain/auction/auctionCancel.js";
import { getRoomMessages } from "../chat/chatRoomService.js";
import { updateUserBan, applyStrictBan } from "../admin/adminUserService.js";
import { createAdminWarningReview } from "../reviews/reviewService.js";
import { getPagination, paginatedResponse } from "../admin/adminPagination.js";
import { ReportServiceError } from "./reportErrors.js";
import { REPORT_MIN_REASON_LENGTH, REPORT_REASON_PREVIEW_LENGTH } from "./reportConstants.js";

const reportListInclude = {
  reporter: { select: { id: true, ingameName: true } },
  target: { select: { id: true, ingameName: true, isBanned: true, reputationScore: true } },
  auction: {
    select: {
      id: true,
      status: true,
      currentPrice: true,
      item: { select: { name: true, iconUrl: true } },
    },
  },
  room: { select: { id: true, _count: { select: { messages: true } } } },
};

const truncateReason = (reason) => {
  const text = String(reason || "").trim();
  if (text.length <= REPORT_REASON_PREVIEW_LENGTH) return text;
  return `${text.slice(0, REPORT_REASON_PREVIEW_LENGTH)}…`;
};

export const submitTradeReport = async ({ roomId, reporterId, reason }) => {
  const trimmedReason = String(reason || "").trim();
  if (trimmedReason.length < REPORT_MIN_REASON_LENGTH) {
    throw new ReportServiceError(`신고 사유는 ${REPORT_MIN_REASON_LENGTH}자 이상 입력해주세요.`, 400);
  }

  const parsedRoomId = parseInt(roomId, 10);
  if (Number.isNaN(parsedRoomId)) {
    throw new ReportServiceError("유효하지 않은 채팅방입니다.", 400);
  }

  const room = await prisma.chatRoom.findUnique({
    where: { id: parsedRoomId },
    include: { auction: true },
  });

  if (!room) {
    throw new ReportServiceError("채팅방을 찾을 수 없습니다.", 404);
  }
  if (room.isAdminChat || !room.auctionId || !room.auction) {
    throw new ReportServiceError("거래 채팅만 신고할 수 있습니다.", 400);
  }
  if (room.sellerId !== reporterId && room.buyerId !== reporterId) {
    throw new ReportServiceError("해당 채팅방에 참여한 사용자만 신고할 수 있습니다.", 403);
  }
  if (room.status !== "ACTIVE") {
    throw new ReportServiceError("이미 종료된 채팅방입니다.", 400);
  }
  if (room.auction.status !== "PENDING_TRADE") {
    throw new ReportServiceError("거래 진행 중인 경매만 신고할 수 있습니다.", 400);
  }

  const existing = await prisma.report.findUnique({ where: { roomId: parsedRoomId } });
  if (existing) {
    throw new ReportServiceError("이미 신고된 거래입니다.", 409);
  }

  const targetId = room.sellerId === reporterId ? room.buyerId : room.sellerId;
  const previousAuctionStatus = room.auction.status;

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        roomId: parsedRoomId,
        auctionId: room.auctionId,
        reporterId,
        targetId,
        reason: trimmedReason,
        previousAuctionStatus,
      },
      include: reportListInclude,
    });

    await tx.auction.update({
      where: { id: room.auctionId },
      data: { status: "EXPIRED" },
    });

    await tx.chatRoom.update({
      where: { id: parsedRoomId },
      data: { status: "ARCHIVED" },
    });

    return created;
  });

  await removeAuctionQueueJobs(room.auctionId);

  return {
    report: formatReportListItem(report),
    sellerId: room.sellerId,
    buyerId: room.buyerId,
  };
};

export const listReports = async (query) => {
  const { page, limit, skip } = getPagination(query, 20, 50);
  const status = String(query.status || "PENDING").toUpperCase();
  const where = status === "ALL" ? {} : { status };

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: reportListInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);

  return paginatedResponse({
    items: reports.map(formatReportListItem),
    total,
    page,
    limit,
  });
};

export const getReportById = async (reportId) => {
  const parsedId = parseInt(reportId, 10);
  if (Number.isNaN(parsedId)) {
    throw new ReportServiceError("유효하지 않은 신고 ID입니다.", 400);
  }

  const report = await prisma.report.findUnique({
    where: { id: parsedId },
    include: {
      ...reportListInclude,
      resolvedBy: { select: { id: true, ingameName: true } },
    },
  });

  if (!report) {
    throw new ReportServiceError("신고 내역을 찾을 수 없습니다.", 404);
  }

  return formatReportDetail(report);
};

export const getReportMessages = async (reportId, adminId, adminRole) => {
  const report = await getReportById(reportId);
  return getRoomMessages(report.roomId, adminId, adminRole);
};

const RESOLVE_ACTIONS = {
  dismiss: { status: "DISMISSED", resolution: "DISMISS" },
  ban: { status: "RESOLVED", resolution: "BAN" },
  strict_ban: { status: "RESOLVED", resolution: "STRICT_BAN" },
  warning: { status: "RESOLVED", resolution: "WARNING" },
};

export const resolveReport = async ({ reportId, adminId, action }) => {
  const normalized = String(action || "").toLowerCase();
  const mapping = RESOLVE_ACTIONS[normalized];
  if (!mapping) {
    throw new ReportServiceError("유효하지 않은 처리 방식입니다.", 400);
  }

  const parsedId = parseInt(reportId, 10);
  if (Number.isNaN(parsedId)) {
    throw new ReportServiceError("유효하지 않은 신고 ID입니다.", 400);
  }

  const report = await prisma.report.findUnique({
    where: { id: parsedId },
    include: reportListInclude,
  });

  if (!report) {
    throw new ReportServiceError("신고 내역을 찾을 수 없습니다.", 404);
  }
  if (report.status !== "PENDING") {
    throw new ReportServiceError("이미 처리된 신고입니다.", 400);
  }

  if (normalized === "ban") {
    await updateUserBan(report.targetId, true);
  } else if (normalized === "strict_ban") {
    await applyStrictBan(report.targetId, true);
  } else if (normalized === "warning") {
    await createAdminWarningReview({
      adminId,
      auctionId: report.auctionId,
      revieweeId: report.targetId,
      reportId: report.id,
    });
  }

  const updated = await prisma.report.update({
    where: { id: parsedId },
    data: {
      status: mapping.status,
      resolution: mapping.resolution,
      resolvedById: adminId,
      resolvedAt: new Date(),
    },
    include: {
      ...reportListInclude,
      resolvedBy: { select: { id: true, ingameName: true } },
    },
  });

  return formatReportDetail(updated);
};

const formatReportListItem = (report) => ({
  id: report.id,
  roomId: report.roomId,
  auctionId: report.auctionId,
  status: report.status,
  resolution: report.resolution,
  reasonPreview: truncateReason(report.reason),
  createdAt: report.createdAt,
  reporter: report.reporter,
  target: report.target,
  auction: report.auction,
  messageCount: report.room?._count?.messages ?? 0,
});

const formatReportDetail = (report) => ({
  ...formatReportListItem(report),
  reason: report.reason,
  previousAuctionStatus: report.previousAuctionStatus,
  resolvedAt: report.resolvedAt,
  resolvedBy: report.resolvedBy || null,
});
