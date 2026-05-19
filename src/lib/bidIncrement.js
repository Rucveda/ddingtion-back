/**
 * 구간별 최소 입찰 인상 + 마감 임박 시간 배수
 * - 가격: 백(1천 미만) 1만 / 천(1억 미만) 10만 / 억 50만
 * - 시간: 1시간 초과 ×1 / 1시간~10분 ×2 / 10분 이내 ×3
 * - 마감 10분 이내 유효 입찰 시 종료 시각 +3분 (BullMQ 재예약)
 */
const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;

const TIER_THOUSAND = 1_000n;
const TIER_EOK = 100_000_000n;

const INCREMENT_HUNDREDS = 10_000n;
const INCREMENT_THOUSANDS = 100_000n;
const INCREMENT_EOK = 500_000n;

export const BID_EXTENSION_THRESHOLD_MS = 10 * MS_MINUTE;
export const BID_EXTENSION_MS = 3 * MS_MINUTE;

export const BID_TIME_BANDS = [
  {
    id: "normal",
    label: "마감 1시간 초과",
    multiplier: 1,
    description: "가격 구간 기본 최소 인상",
  },
  {
    id: "soon",
    label: "마감 1시간 이내",
    multiplier: 2,
    description: "최소 인상 2배",
  },
  {
    id: "final",
    label: "마감 10분 이내",
    multiplier: 3,
    description: "최소 인상 3배 · 유효 입찰 시 3분 연장",
  },
];

export const PRICE_INCREMENT_TIERS = [
  { label: "백 단위 (1,000G 미만)", increment: "10,000" },
  { label: "천 단위 (1,000G ~ 1억G 미만)", increment: "100,000" },
  { label: "억 단위 (1억G 이상)", increment: "500,000" },
];

export const toBidPriceBigInt = (value) => {
  if (typeof value === "bigint") return value;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0n;
  return BigInt(Math.floor(num));
};

export const getBaseMinBidIncrement = (currentPrice) => {
  const price = toBidPriceBigInt(currentPrice);
  if (price < TIER_THOUSAND) return INCREMENT_HUNDREDS;
  if (price < TIER_EOK) return INCREMENT_THOUSANDS;
  return INCREMENT_EOK;
};

export const getPriceTierLabel = (currentPrice) => {
  const price = toBidPriceBigInt(currentPrice);
  if (price < TIER_THOUSAND) return "백 단위";
  if (price < TIER_EOK) return "천 단위";
  return "억 단위";
};

export const getTimeBidContext = (endTime, now = new Date()) => {
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  const remainingMs = Math.max(0, end.getTime() - now.getTime());

  if (remainingMs > MS_HOUR) {
    return { multiplier: 1n, band: BID_TIME_BANDS[0], remainingMs, extendsOnBid: false };
  }
  if (remainingMs > BID_EXTENSION_THRESHOLD_MS) {
    return { multiplier: 2n, band: BID_TIME_BANDS[1], remainingMs, extendsOnBid: false };
  }
  return { multiplier: 3n, band: BID_TIME_BANDS[2], remainingMs, extendsOnBid: remainingMs > 0 };
};

export const getMinBidIncrement = (currentPrice, endTime, now = new Date()) => {
  const base = getBaseMinBidIncrement(currentPrice);
  const { multiplier } = getTimeBidContext(endTime, now);
  return base * multiplier;
};

export const getMinimumBid = (currentPrice, endTime, now = new Date()) => {
  const price = toBidPriceBigInt(currentPrice);
  return price + getMinBidIncrement(price, endTime, now);
};

export const shouldExtendAuctionOnBid = (endTime, now = new Date()) => {
  const { extendsOnBid } = getTimeBidContext(endTime, now);
  return extendsOnBid;
};

export const computeExtendedEndTime = (currentEndTime, now = new Date()) => {
  const end = currentEndTime instanceof Date ? currentEndTime : new Date(currentEndTime);
  const anchor = Math.max(end.getTime(), now.getTime());
  return new Date(anchor + BID_EXTENSION_MS);
};
