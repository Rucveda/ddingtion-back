import prisma from "../../db.js";
import { publicUserSelect, minecraftNamePattern, toPublicUser } from "./authShared.js";
import { AuthServiceError } from "./authErrors.js";

export const getMe = async (userId) => {
  if (Number.isNaN(userId)) {
    throw new AuthServiceError("유효하지 않은 유저 식별자입니다.", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      loginId: true,
      ingameName: true,
      role: true,
      isBanned: true,
      reputationScore: true,
      reviewCount: true,
      successfulTrades: true,
      createdAt: true,
      discordId: true,
    },
  });

  if (!user) {
    throw new AuthServiceError("사용자를 찾을 수 없습니다.", 404);
  }
  if (user.isBanned) {
    throw new AuthServiceError("관리자에 의해 차단된 계정입니다.", 403, "ACCOUNT_BANNED");
  }

  return toPublicUser(user);
};

export const updateMinecraftName = async (userId, minecraftName) => {
  if (!minecraftNamePattern.test(minecraftName)) {
    throw new AuthServiceError("마인크래프트 닉네임은 영문, 숫자, _ 조합의 3~16자여야 합니다.", 400);
  }
  if (Number.isNaN(userId)) {
    throw new AuthServiceError("유효하지 않은 유저 식별자입니다.", 400);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isBanned: true },
  });
  if (!currentUser || currentUser.isBanned) {
    throw new AuthServiceError("차단된 계정은 정보를 변경할 수 없습니다.", 403);
  }

  const existing = await prisma.user.findFirst({
    where: {
      id: { not: userId },
      OR: [{ loginId: minecraftName }, { ingameName: minecraftName }],
    },
    select: { id: true },
  });
  if (existing) {
    throw new AuthServiceError("이미 사용 중인 마인크래프트 닉네임입니다.", 409);
  }

  return prisma.user.update({
    where: { id: userId },
    data: { loginId: minecraftName, ingameName: minecraftName },
    select: publicUserSelect,
  });
};
