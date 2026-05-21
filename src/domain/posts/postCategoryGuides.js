import prisma from "../../db.js";
import {
  DEFAULT_CATEGORY_GUIDES,
  WRITABLE_POST_CATEGORIES,
  normalizeWritablePostCategory,
} from "./postCategories.js";

export const loadPostCategoryGuides = async () => {
  const rows = await prisma.postCategoryGuide.findMany();
  const map = { ...DEFAULT_CATEGORY_GUIDES };

  for (const row of rows) {
    if (WRITABLE_POST_CATEGORIES.includes(row.category) && row.guideText?.trim()) {
      map[row.category] = row.guideText.trim();
    }
  }

  const missing = WRITABLE_POST_CATEGORIES.filter((category) => !rows.some((r) => r.category === category));
  if (missing.length > 0) {
    await prisma.$transaction(
      missing.map((category) =>
        prisma.postCategoryGuide.upsert({
          where: { category },
          update: {},
          create: { category, guideText: DEFAULT_CATEGORY_GUIDES[category] },
        })
      )
    );
  }

  return map;
};

export const savePostCategoryGuide = async (category, guideText) => {
  const normalized = normalizeWritablePostCategory(category);
  const text = String(guideText || "").trim();
  if (!text) {
    const err = new Error("안내 문구를 입력해 주세요.");
    err.status = 400;
    throw err;
  }
  if (text.length > 2000) {
    const err = new Error("안내 문구는 2000자 이내로 작성해 주세요.");
    err.status = 400;
    throw err;
  }

  const row = await prisma.postCategoryGuide.upsert({
    where: { category: normalized },
    update: { guideText: text },
    create: { category: normalized, guideText: text },
  });

  return { category: row.category, guideText: row.guideText };
};
