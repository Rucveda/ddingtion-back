import { createRedisClient } from "./redis.js";

const redis = createRedisClient();
const STRICT_BANNED_IPS_KEY = "strict_banned_ips";

export const getClientIp = (req) =>
  req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req?.socket?.remoteAddress ||
  "unknown";

export const getSocketClientIp = (socket) =>
  socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  socket.handshake.address ||
  "unknown";

export const isIpStrictBanned = async (ip) => {
  if (!ip || ip === "unknown") return false;
  const result = await redis.sismember(STRICT_BANNED_IPS_KEY, ip);
  return result === 1;
};

export const addStrictBannedIp = async (ip) => {
  if (!ip || ip === "unknown") return false;
  await redis.sadd(STRICT_BANNED_IPS_KEY, ip);
  return true;
};

export const removeStrictBannedIp = async (ip) => {
  if (!ip) return;
  await redis.srem(STRICT_BANNED_IPS_KEY, ip);
};

export const assertIpNotStrictBanned = async (ip) => {
  if (await isIpStrictBanned(ip)) {
    const err = new Error("관리자에 의해 네트워크(IP) 접근이 제한되었습니다.");
    err.status = 403;
    err.code = "IP_STRICT_BANNED";
    throw err;
  }
};
