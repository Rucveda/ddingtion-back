import prisma from "../../db.js";
import { isKnownPostCategory } from "../../domain/posts/postCategories.js";
import { loadPostCategoryGuides } from "../../domain/posts/postCategoryGuides.js";

export const getCategoryGuides = () => loadPostCategoryGuides();

export const listPosts = async (query) => {
  const { type, category } = query;
  const whereClause = {};
  const isNoticeRequest = type && type.toUpperCase() === "NOTICE";

  if (type) {
    whereClause.type = type.toUpperCase();
  }
  if (category && String(category).toUpperCase() !== "ALL") {
    const normalized = String(category).trim().toUpperCase();
    if (isKnownPostCategory(normalized)) {
      whereClause.category = normalized;
    }
  }

  return prisma.post.findMany({
    where: whereClause,
    take: isNoticeRequest ? 1 : 50,
    include: {
      author: {
        select: { ingameName: true, role: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};
