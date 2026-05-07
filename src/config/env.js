import "dotenv/config";

const readEnv = (key, { required = false, defaultValue } = {}) => {
  const value = process.env[key];
  if ((value === undefined || value === "") && required) {
    throw new Error(`[ENV] Missing required environment variable: ${key}`);
  }
  return value ?? defaultValue;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: readEnv("PORT", { defaultValue: "8080" }),
  DATABASE_URL: readEnv("DATABASE_URL", { required: true }),
  JWT_SECRET: readEnv("JWT_SECRET", { required: true }),
  FRONTEND_URL: readEnv("FRONTEND_URL", { defaultValue: "https://ddingtion-front.vercel.app" }),
  REDIS_URL: readEnv("REDIS_URL", { defaultValue: "redis://127.0.0.1:6379" }),
  SUPABASE_URL: readEnv("SUPABASE_URL"),
  SUPABASE_KEY: readEnv("SUPABASE_KEY"),
};
