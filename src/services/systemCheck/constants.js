/** 재사용 가능한 헬스체크 전용 계정 (다른 플로우 검사에서도 동일 ID 사용) */
export const HC_SELLER_LOGIN_ID = "__hc_seller__";
export const HC_BUYER_LOGIN_ID = "__hc_buyer__";
export const HC_SELLER_INGAME = "HcSeller";
export const HC_BUYER_INGAME = "HcBuyer";
export const HC_DISCORD_SELLER = "hc:system-check:seller";
export const HC_DISCORD_BUYER = "hc:system-check:buyer";

export const SYSTEM_CHECK_DESC_PREFIX = "__SYSTEM_CHECK__:";

export const systemCheckDescription = (runId) => `${SYSTEM_CHECK_DESC_PREFIX}${runId}`;

export const isSystemCheckDescription = (description) =>
  typeof description === "string" && description.startsWith(SYSTEM_CHECK_DESC_PREFIX);
