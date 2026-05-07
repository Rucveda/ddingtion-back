import Redis from "ioredis";
import { env } from "../config/env.js";

export const getRedisOptions = () => ({
  maxRetriesPerRequest: null,
  ...(env.REDIS_URL.includes("rediss://") ? { tls: { rejectUnauthorized: false } } : {}),
});

export const createRedisClient = () => new Redis(env.REDIS_URL, getRedisOptions());
