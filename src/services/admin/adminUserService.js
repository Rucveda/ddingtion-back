import bcrypt from "bcrypt";
import prisma from "../../db.js";
import { createRedisClient } from "../../lib/redis.js";
import { addStrictBannedIp, removeStrictBannedIp } from "../../lib/strictIpBan.js";
import { AdminServiceError } from "./adminErrors.js";
import { getPagination, paginatedResponse } from "./adminPagination.js";

export const updateUserRole = async (id, role) => {
  if (!role) {
    throw new AdminServiceError("변경할 역할이 지정되지 않았습니다.", 400);
  }
  return prisma.user.update({
    where: { id: parseInt(id, 10) },
    data: { role: role.toUpperCase() },
  });
};

export const updateUserBan = (id, isBanned) =>
  prisma.user.update({
    where: { id: parseInt(id, 10) },
    data: { isBanned: Boolean(isBanned) },
  });

export const applyStrictBan = async (userId, enable) => {
  const redis = createRedisClient();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bannedIp: true, ingameName: true },
  });
  if (!existing) {
    throw new AdminServiceError("사용자를 찾을 수 없습니다.", 404);
  }

  let bannedIp = existing.bannedIp;
  if (enable) {
    bannedIp = (await redis.get(`user_ip:${userId}`)) || existing.bannedIp || null;
    if (bannedIp) {
      await addStrictBannedIp(bannedIp);
    }
  } else if (bannedIp) {
    await removeStrictBannedIp(bannedIp);
    bannedIp = null;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      isBanned: enable,
      bannedIp: enable ? bannedIp : null,
    },
    select: {
      id: true,
      loginId: true,
      ingameName: true,
      isBanned: true,
      bannedIp: true,
      discordId: true,
    },
  });

  return { user, bannedIp, enable };
};

export const anonymizeUser = async (userId, currentAdminId) => {
  if (currentAdminId && currentAdminId === userId) {
    throw new AdminServiceError("현재 로그인한 관리자 계정은 익명화할 수 없습니다.", 400);
  }

  const anonymizedName = `deleted_user_${userId}`;
  const passwordHash = await bcrypt.hash(`deleted:${userId}:${Date.now()}:${Math.random()}`, 10);

  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        loginId: anonymizedName,
        ingameName: anonymizedName,
        passwordHash,
        discordId: null,
        isBanned: true,
        role: "USER",
      },
      select: {
        id: true,
        loginId: true,
        ingameName: true,
        isBanned: true,
        discordId: true,
      },
    });
  } catch (error) {
    if (error.code === "P2025") {
      throw new AdminServiceError("사용자를 찾을 수 없습니다.", 404);
    }
    throw error;
  }
};

export const listUsers = async (query) => {
  const { page, limit, skip } = getPagination(query, 30, 100);
  const q = String(query.q || "").trim();
  const numericQuery = /^\d+$/.test(q) ? parseInt(q, 10) : null;
  const where = q
    ? {
        OR: [
          ...(numericQuery !== null ? [{ id: numericQuery }] : []),
          { loginId: { contains: q, mode: "insensitive" } },
          { ingameName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        loginId: true,
        ingameName: true,
        role: true,
        isBanned: true,
        bannedIp: true,
        createdAt: true,
        reputationScore: true,
        successfulTrades: true,
        discordId: true,
      },
      orderBy: { id: "asc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const items = users.map(({ discordId, ...user }) => ({
    ...user,
    discordLinked: Boolean(discordId),
    strictBanActive: Boolean(user.isBanned && user.bannedIp),
  }));

  return paginatedResponse({ items, total, page, limit });
};

export const formatUserWithDiscord = (user) => ({
  ...user,
  discordLinked: Boolean(user.discordId),
  strictBanActive: Boolean(user.isBanned && user.bannedIp),
});
