import { env, isDiscordVerificationEnforced } from "../config/env.js";

const DISCORD_API = "https://discord.com/api/v10";
const TOKEN_URL = "https://discord.com/api/oauth2/token";

/**
 * Discord OAuth2: authorization_code → access_token
 */
export async function exchangeDiscordCode(code) {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.error || "토큰 교환 실패";
    throw new Error(msg);
  }
  return data;
}

export async function fetchDiscordCurrentUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(user.message || "디스코드 프로필 조회 실패");
  }
  return user;
}

/**
 * OAuth2 `guilds` 범위로 사용자가 참가 중인 길드 목록 (페이지네이션).
 * 특정 서버(길드 ID) 소속 여부 확인에 사용합니다.
 */
export async function fetchAllDiscordGuilds(accessToken) {
  const all = [];
  let after;
  for (;;) {
    const url = new URL(`${DISCORD_API}/users/@me/guilds`);
    url.searchParams.set("limit", "200");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const batch = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(batch.message || "서버 목록을 가져오지 못했습니다.");
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 200) break;
    after = batch[batch.length - 1].id;
  }
  return all;
}

export function assertUserInRequiredGuild(guilds, requiredGuildId) {
  if (!requiredGuildId) return;
  const ok = guilds.some((g) => String(g.id) === String(requiredGuildId));
  if (!ok) {
    throw new Error("REQUIRED_GUILD_MISSING");
  }
}

export function buildDiscordOAuthScopes() {
  const scopes = ["identify"];
  if (env.DISCORD_REQUIRED_GUILD_ID) {
    scopes.push("guilds");
  }
  return scopes.join(" ");
}

export function buildDiscordAuthorizeUrl(state) {
  if (!isDiscordVerificationEnforced()) {
    throw new Error("Discord OAuth가 서버에 설정되지 않았습니다.");
  }
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: buildDiscordOAuthScopes(),
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
