import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../db.js";
import { clearLoginRateLimit, enforceLoginRateLimit } from "../../lib/rateLimit.js";
import { AuthServiceError } from "./authErrors.js";
import { JWT_SECRET, roleForDiscordVerifiedUser, withDiscordMeta } from "./authShared.js";

export const register = async ({ loginId, password, ingameName }) => {
  if (!loginId || !password || !ingameName) {
    throw new AuthServiceError("모든 필드를 입력해주세요.", 400);
  }

  const trimmedLoginId = loginId.trim();
  const trimmedIngameName = ingameName.trim();

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ loginId: trimmedLoginId }, { ingameName: trimmedIngameName }] },
  });

  if (existingUser) {
    const field = existingUser.loginId === trimmedLoginId ? "아이디" : "닉네임";
    throw new AuthServiceError(`이미 존재하는 ${field}입니다.`, 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await prisma.user.create({
    data: {
      loginId: trimmedLoginId,
      passwordHash: hashedPassword,
      ingameName: trimmedIngameName,
      role: "USER",
      reputationScore: 0,
      reviewCount: 0,
    },
  });

  return {
    message: "회원가입 완료",
    user: withDiscordMeta({
      id: newUser.id,
      loginId: newUser.loginId,
      ingameName: newUser.ingameName,
      role: newUser.role,
      discordId: null,
    }),
  };
};

export const login = async ({ loginId, password, rememberMe, clientIp }) => {
  if (!loginId || !password) {
    throw new AuthServiceError("정보를 입력해주세요.", 400);
  }

  await enforceLoginRateLimit(clientIp);

  const trimmedLoginId = loginId.trim();
  // 로그인 UI는 "마인크래프트 닉네임"을 받으므로 loginId·ingameName 모두 조회
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { loginId: { equals: trimmedLoginId, mode: "insensitive" } },
        { ingameName: { equals: trimmedLoginId, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      loginId: true,
      ingameName: true,
      role: true,
      passwordHash: true,
      isBanned: true,
      reputationScore: true,
      reviewCount: true,
      discordId: true,
    },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthServiceError("아이디 또는 비밀번호가 잘못되었습니다.", 401);
  }

  await clearLoginRateLimit(clientIp);

  if (user.isBanned) {
    throw new AuthServiceError("관리자에 의해 차단된 계정입니다. 접속할 수 없습니다.", 403, "ACCOUNT_BANNED");
  }

  if (user.discordId && user.role?.toUpperCase() === "USER") {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "WRITER" },
    });
    user.role = "WRITER";
  }

  const remember = rememberMe === true || rememberMe === "true";
  const token = jwt.sign(
    { id: user.id, ingameName: user.ingameName, role: user.role },
    JWT_SECRET,
    { expiresIn: remember ? "30d" : "24h" },
  );

  const { passwordHash: _ph, discordId, ...pub } = user;

  return {
    message: "로그인 성공",
    token,
    user: withDiscordMeta({ ...pub, discordId }),
  };
};
