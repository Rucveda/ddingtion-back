/** 커뮤니티 말머리 (신규 작성 허용) */
export const WRITABLE_POST_CATEGORIES = ["WILD", "ISLAND", "RPG", "MARKET_TALK"];

/** 목록 필터·표시용 (레거시 말머리 포함) */
export const ALL_POST_CATEGORIES = [
  ...WRITABLE_POST_CATEGORIES,
  "GENERAL",
  "TRADE",
  "QUESTION",
];

export const POST_CATEGORY_LABELS = {
  WILD: "WILD",
  ISLAND: "ISLAND",
  RPG: "RPG",
  MARKET_TALK: "시세토론",
  GENERAL: "일반",
  TRADE: "거래",
  QUESTION: "질문",
};

export const DEFAULT_CATEGORY_GUIDES = {
  WILD:
    "WILD 카테고리 아이템 관련 글을 올려 주세요.\n예: 옵션·인챈트 질문, 세팅 공유, 아이템 정보 정리",
  ISLAND:
    "ISLAND(섬) 카테고리 아이템 관련 글을 올려 주세요.\n예: 각인·채집·농사 세팅, 아이템 비교, 이용 팁",
  RPG:
    "RPG 카테고리 아이템 관련 글을 올려 주세요.\n예: 스킬·룬 조합, 장비 세팅, 직업별 정보",
  MARKET_TALK:
    "시세·가격에 대한 의견·분석·토론 글을 올려 주세요.\n예: 최근 체결가 해석, 적정가 의견, 시장 동향 (개인 거래 희망 글은 경매 등록 이용)",
};

export const getPostCategoryLabel = (category) =>
  POST_CATEGORY_LABELS[category] || category || "기타";

export const normalizeWritablePostCategory = (category) => {
  const normalized = String(category || "WILD").trim().toUpperCase();
  return WRITABLE_POST_CATEGORIES.includes(normalized) ? normalized : "WILD";
};

export const isKnownPostCategory = (category) => {
  const normalized = String(category || "").trim().toUpperCase();
  return ALL_POST_CATEGORIES.includes(normalized);
};
