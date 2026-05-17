import "dotenv/config";

const readEnv = (key, { required = false, defaultValue } = {}) => {
  const value = process.env[key];
  const normalized = typeof value === "string" ? value.trim() : value;
  if ((normalized === undefined || normalized === "") && required) {
    throw new Error(`[ENV] Missing required environment variable: ${key}`);
  }
  return normalized || defaultValue;
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
  /** Discord 계정 연동 (OAuth2). 설정 시 입찰·즉시 구매에 디스코드 인증 필요 */
  DISCORD_CLIENT_ID: readEnv("DISCORD_CLIENT_ID"),
  DISCORD_CLIENT_SECRET: readEnv("DISCORD_CLIENT_SECRET"),
  DISCORD_REDIRECT_URI: readEnv("DISCORD_REDIRECT_URI"),
  /** 선택: 해당 디스코드 서버(길드)에 가입한 계정만 연동 허용 (OAuth `guilds` 범위 사용) */
  DISCORD_REQUIRED_GUILD_ID: readEnv("DISCORD_REQUIRED_GUILD_ID"),
};

/** 클라이언트·시크릿·리다이렉트가 모두 있을 때만 디스코드 인증을 강제합니다. */
export const isDiscordVerificationEnforced = () =>
  Boolean(
    env.DISCORD_CLIENT_ID &&
      env.DISCORD_CLIENT_SECRET &&
      env.DISCORD_REDIRECT_URI
  );

export const getDiscordConfigStatus = () => {
  const requiredKeys = [
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_REDIRECT_URI",
  ];

  return {
    enabled: isDiscordVerificationEnforced(),
    missing: requiredKeys.filter((key) => !env[key]),
    guildCheckEnabled: Boolean(env.DISCORD_REQUIRED_GUILD_ID),
  };
};
