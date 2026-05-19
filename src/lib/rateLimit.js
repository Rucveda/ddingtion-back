import { createRedisClient } from "./redis.js";

const redis = createRedisClient();

export const RATE_LIMIT = {
  BID_INTERVAL_MS: 3_000,
  LOGIN_WINDOW_SEC: 5 * 60,
  LOGIN_MAX_ATTEMPTS: 20,
  LOGIN_BLOCK_SEC: 10 * 60,
  COMMENT_INTERVAL_MS: 3_000,
  COMMENT_WINDOW_SEC: 60,
  COMMENT_MAX_PER_WINDOW: 15,
  COMMENT_BLOCK_SEC: 10 * 60,
};

export class RateLimitError extends Error {
  constructor(message, retryAfterSec = null) {
    super(message);
    this.name = "RateLimitError";
    this.status = 429;
    this.retryAfterSec = retryAfterSec;
  }
}

const secondsUntil = (unixMs) => Math.max(1, Math.ceil((unixMs - Date.now()) / 1000));

/** 최소 간격(예: 입찰 3초) */
export const enforceMinInterval = async (key, intervalMs, message) => {
  const lastRaw = await redis.get(key);
  if (lastRaw) {
    const last = Number(lastRaw);
    const elapsed = Date.now() - last;
    if (elapsed < intervalMs) {
      throw new RateLimitError(
        message || `요청이 너무 빠릅니다. ${secondsUntil(last + intervalMs)}초 후 다시 시도해주세요.`,
        secondsUntil(last + intervalMs),
      );
    }
  }
  await redis.set(key, String(Date.now()), "EX", Math.ceil(intervalMs / 1000) + 5);
};

/** 로그인: 5분 내 20회 초과 시 10분 차단 */
export const enforceLoginRateLimit = async (ip) => {
  const normalizedIp = ip || "unknown";
  const blockKey = `rate:login:block:${normalizedIp}`;
  const blockedUntil = await redis.get(blockKey);
  if (blockedUntil) {
    throw new RateLimitError(
      "로그인 시도가 너무 많습니다. 10분 후 다시 시도해주세요.",
      secondsUntil(Number(blockedUntil)),
    );
  }

  const attemptsKey = `rate:login:attempts:${normalizedIp}`;
  const count = await redis.incr(attemptsKey);
  if (count === 1) {
    await redis.expire(attemptsKey, RATE_LIMIT.LOGIN_WINDOW_SEC);
  }
  if (count > RATE_LIMIT.LOGIN_MAX_ATTEMPTS) {
    const until = Date.now() + RATE_LIMIT.LOGIN_BLOCK_SEC * 1000;
    await redis.set(blockKey, String(until), "EX", RATE_LIMIT.LOGIN_BLOCK_SEC);
    await redis.del(attemptsKey);
    throw new RateLimitError(
      "로그인 시도가 너무 많습니다. 10분 후 다시 시도해주세요.",
      RATE_LIMIT.LOGIN_BLOCK_SEC,
    );
  }
};

export const clearLoginRateLimit = async (ip) => {
  const normalizedIp = ip || "unknown";
  await redis.del(`rate:login:attempts:${normalizedIp}`);
  await redis.del(`rate:login:block:${normalizedIp}`);
};

/** 댓글: 3초 간격 + 1분 15개 초과 시 10분 차단 */
export const enforceCommentRateLimit = async (userId) => {
  const blockKey = `rate:comment:block:${userId}`;
  const blockedUntil = await redis.get(blockKey);
  if (blockedUntil) {
    throw new RateLimitError(
      "댓글 작성이 일시 제한되었습니다. 10분 후 다시 시도해주세요.",
      secondsUntil(Number(blockedUntil)),
    );
  }

  await enforceMinInterval(
    `rate:comment:last:${userId}`,
    RATE_LIMIT.COMMENT_INTERVAL_MS,
    "댓글은 3초 간격으로 작성할 수 있습니다.",
  );

  const countKey = `rate:comment:count:${userId}`;
  const count = await redis.incr(countKey);
  if (count === 1) {
    await redis.expire(countKey, RATE_LIMIT.COMMENT_WINDOW_SEC);
  }
  if (count > RATE_LIMIT.COMMENT_MAX_PER_WINDOW) {
    const until = Date.now() + RATE_LIMIT.COMMENT_BLOCK_SEC * 1000;
    await redis.set(blockKey, String(until), "EX", RATE_LIMIT.COMMENT_BLOCK_SEC);
    await redis.del(countKey);
    throw new RateLimitError(
      "댓글 작성이 너무 많습니다. 10분 후 다시 시도해주세요.",
      RATE_LIMIT.COMMENT_BLOCK_SEC,
    );
  }
};

export const enforceBidRateLimit = async (userId) => {
  await enforceMinInterval(
    `rate:bid:last:${userId}`,
    RATE_LIMIT.BID_INTERVAL_MS,
    "입찰은 3초 간격으로 가능합니다.",
  );
};
