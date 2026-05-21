import prisma from "../../db.js";
import { savePostCategoryGuide } from "../../domain/posts/postCategoryGuides.js";
import { WRITABLE_POST_CATEGORIES } from "../../domain/posts/postCategories.js";
import { AdminServiceError } from "./adminErrors.js";
import { getPagination, paginatedResponse } from "./adminPagination.js";

export const listReports = async (query) => {
  const { page, limit, skip } = getPagination(query, 20, 100);
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      include: {
        reporter: { select: { id: true, ingameName: true } },
        target: { select: { id: true, ingameName: true } },
        room: {
          select: {
            id: true,
            status: true,
            auctionId: true,
            auction: {
              select: {
                id: true,
                status: true,
                currentPrice: true,
                endTime: true,
                item: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.report.count(),
  ]);

  const items = reports.map((report) => ({
    ...report,
    auction: report.room?.auction
      ? {
          ...report.room.auction,
          currentPrice: report.room.auction.currentPrice?.toString?.() ?? report.room.auction.currentPrice,
        }
      : null,
  }));

  return paginatedResponse({ items, total, page, limit });
};

export const resolveReport = (id, isResolved) =>
  prisma.report.update({
    where: { id: parseInt(id, 10) },
    data: { isResolved },
  });

export const deleteReport = (id) =>
  prisma.report.delete({ where: { id: parseInt(id, 10) } });

export const updatePostCategoryGuide = async (category, guideText) => {
  const normalized = String(category || "").trim().toUpperCase();
  if (!WRITABLE_POST_CATEGORIES.includes(normalized)) {
    throw new AdminServiceError("유효하지 않은 말머리입니다.", 400);
  }
  return savePostCategoryGuide(normalized, guideText);
};
