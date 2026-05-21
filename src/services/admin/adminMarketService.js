import prisma from "../../db.js";
import { getPagination, paginatedResponse } from "./adminPagination.js";

export const listMarketVariables = () =>
  prisma.marketVariable.findMany({ orderBy: { category: "asc" } });

export const upsertMarketVariable = ({ key, value, category, label }) =>
  prisma.marketVariable.upsert({
    where: { key },
    update: { value: parseFloat(value), label, category },
    create: { key, value: parseFloat(value), label, category },
  });

export const listMarketHistory = async (query) => {
  const { page, limit, skip } = getPagination(query, 30, 100);
  const [history, total] = await Promise.all([
    prisma.marketHistory.findMany({
      include: { item: { select: { name: true, category: true } } },
      orderBy: { tradeDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.marketHistory.count(),
  ]);
  const items = history.map((h) => ({ ...h, price: h.price.toString() }));
  return paginatedResponse({ items, total, page, limit });
};

export const updateMarketHistoryStatus = (id, { isValid, excludeReason }) =>
  prisma.marketHistory.update({
    where: { id: parseInt(id, 10) },
    data: {
      isValid: Boolean(isValid),
      excludeReason: isValid ? null : excludeReason,
    },
  });

export const injectMarketHistory = (body) =>
  prisma.marketHistory.create({
    data: {
      itemId: parseInt(body.itemId, 10),
      price: BigInt(body.price),
      tradeDate: new Date(body.tradeDate),
      enhancementLevel: parseInt(body.enhancementLevel, 10) || 0,
      enhancementRank: body.enhancementRank || null,
      enchantments: body.enchantments || null,
      imprint: body.imprint || null,
      skills: body.skills || null,
      runes: body.runes || null,
      isLegacy: false,
      isValid: true,
    },
  });

export const deleteMarketHistory = (id) =>
  prisma.marketHistory.delete({ where: { id: parseInt(id, 10) } });
