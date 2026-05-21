import { env, getDiscordConfigStatus, isDiscordVerificationEnforced } from "../../config/env.js";

export const JWT_SECRET = env.JWT_SECRET;
export const frontendBase = () => env.FRONTEND_URL.replace(/\/$/, "");
export const minecraftNamePattern = /^[A-Za-z0-9_]{3,16}$/;

export const publicUserSelect = {
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
};

export const roleForDiscordVerifiedUser = (role = "USER") => {
  const normalized = role.toUpperCase();
  return normalized === "USER" ? "WRITER" : normalized;
};

export const toPublicUser = (user) => {
  const { discordId, ...rest } = user;
  return {
    ...rest,
    discordLinked: Boolean(discordId),
    discordVerificationRequired: isDiscordVerificationEnforced(),
    discordConfig: getDiscordConfigStatus(),
  };
};

export const withDiscordMeta = (user) => {
  const { discordId, ...rest } = user;
  return {
    ...rest,
    discordLinked: Boolean(discordId),
    discordVerificationRequired: isDiscordVerificationEnforced(),
    discordConfig: getDiscordConfigStatus(),
  };
};
