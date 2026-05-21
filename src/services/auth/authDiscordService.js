import jwt from "jsonwebtoken";
import prisma from "../../db.js";
import { env, isDiscordVerificationEnforced } from "../../config/env.js";
import {
  buildDiscordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordCurrentUser,
  fetchAllDiscordGuilds,
  assertUserInRequiredGuild,
} from "../discordLinkService.js";
import { AuthServiceError } from "./authErrors.js";
import { JWT_SECRET, frontendBase, roleForDiscordVerifiedUser } from "./authShared.js";

export const createDiscordLinkAuthorizeUrl = (userId, existingDiscordId) => {
  if (!isDiscordVerificationEnforced()) {
    throw new AuthServiceError(
      "디스코드 인증이 서버에서 설정되지 않았습니다. 관리자에게 문의하세요.",
      503,
    );
  }
  if (existingDiscordId) {
    throw new AuthServiceError("이미 디스코드 계정이 연동되어 있습니다.", 400);
  }

  const state = jwt.sign({ purpose: "discord_oauth", uid: userId }, JWT_SECRET, { expiresIn: "10m" });
  return { url: buildDiscordAuthorizeUrl(state) };
};

export const processDiscordCallback = async ({ code, state }) => {
  const fail = (reason) => ({
    redirect: `${frontendBase()}/mypage?discord=error&reason=${encodeURIComponent(reason)}`,
  });
  const ok = () => ({ redirect: `${frontendBase()}/mypage?discord=linked` });
  const resetOk = (token) => ({
    redirect: `${frontendBase()}/reset-password?token=${encodeURIComponent(token)}`,
  });

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    return fail("missing_params");
  }

  let payload;
  try {
    payload = jwt.verify(state, JWT_SECRET);
  } catch {
    return fail("invalid_state");
  }
  if (!["discord_oauth", "password_reset"].includes(payload.purpose) || !payload.uid) {
    return fail("invalid_state");
  }

  const userId = parseInt(payload.uid, 10);
  if (Number.isNaN(userId)) return fail("invalid_state");

  const appUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!appUser || appUser.isBanned) {
    return fail("forbidden");
  }
  if (payload.purpose === "discord_oauth" && appUser.discordId) {
    if (appUser.role?.toUpperCase() === "USER") {
      await prisma.user.update({
        where: { id: userId },
        data: { role: "WRITER" },
      });
    }
    return ok();
  }

  const tokenResponse = await exchangeDiscordCode(code);
  const accessToken = tokenResponse.access_token;
  const discordUser = await fetchDiscordCurrentUser(accessToken);
  if (!discordUser.id) return fail("no_discord_user");

  if (env.DISCORD_REQUIRED_GUILD_ID) {
    const guilds = await fetchAllDiscordGuilds(accessToken);
    try {
      assertUserInRequiredGuild(guilds, env.DISCORD_REQUIRED_GUILD_ID);
    } catch (e) {
      if (e.message === "REQUIRED_GUILD_MISSING") return fail("guild");
      throw e;
    }
  }

  const discordId = String(discordUser.id);
  if (payload.purpose === "password_reset") {
    if (!appUser.discordId || appUser.discordId !== discordId) {
      return fail("reset_discord_mismatch");
    }
    const resetToken = jwt.sign(
      { purpose: "password_reset_confirm", uid: appUser.id },
      JWT_SECRET,
      { expiresIn: "15m" },
    );
    return resetOk(resetToken);
  }

  const holder = await prisma.user.findUnique({ where: { discordId } });
  if (holder && holder.id !== userId) {
    if (holder.isBanned) return fail("in_use_banned");
    return fail("in_use");
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        discordId,
        role: roleForDiscordVerifiedUser(appUser.role),
      },
    });
  } catch (e) {
    if (e.code === "P2002") return fail("in_use");
    throw e;
  }

  return ok();
};
