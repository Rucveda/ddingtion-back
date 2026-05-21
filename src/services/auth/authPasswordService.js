import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../db.js";
import { isDiscordVerificationEnforced } from "../../config/env.js";
import { buildDiscordAuthorizeUrl } from "../discordLinkService.js";
import { AuthServiceError } from "./authErrors.js";
import { JWT_SECRET } from "./authShared.js";

export const startPasswordResetAuthorize = async (loginId) => {
  if (!isDiscordVerificationEnforced()) {
    throw new AuthServiceError("디스코드 인증이 서버에서 설정되지 않았습니다.", 503);
  }

  const trimmed = String(loginId || "").trim();
  if (!trimmed) {
    throw new AuthServiceError("마인크래프트 닉네임을 입력해주세요.", 400);
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { loginId: { equals: trimmed, mode: "insensitive" } },
        { ingameName: { equals: trimmed, mode: "insensitive" } },
      ],
    },
    select: { id: true, isBanned: true, discordId: true },
  });

  if (!user || user.isBanned || !user.discordId) {
    throw new AuthServiceError("Discord 인증으로 재설정할 수 없는 계정입니다.", 400);
  }

  const state = jwt.sign({ purpose: "password_reset", uid: user.id }, JWT_SECRET, { expiresIn: "10m" });
  return { url: buildDiscordAuthorizeUrl(state) };
};

export const confirmPasswordReset = async (token, password) => {
  if (!token || !password) {
    throw new AuthServiceError("재설정 토큰과 새 비밀번호를 입력해주세요.", 400);
  }
  if (String(password).length < 4) {
    throw new AuthServiceError("비밀번호는 4자 이상이어야 합니다.", 400);
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AuthServiceError("재설정 링크가 만료되었습니다. 다시 시도해 주세요.", 400);
  }

  if (payload.purpose !== "password_reset_confirm" || !payload.uid) {
    throw new AuthServiceError("유효하지 않은 재설정 토큰입니다.", 400);
  }

  const userId = parseInt(payload.uid, 10);
  if (Number.isNaN(userId)) {
    throw new AuthServiceError("유효하지 않은 계정 정보입니다.", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isBanned: true },
  });
  if (!user || user.isBanned) {
    throw new AuthServiceError("비밀번호를 재설정할 수 없는 계정입니다.", 403);
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { message: "비밀번호가 재설정되었습니다." };
};
