import {
  buildMarketAnalysis,
  parseMarketAnalysisOptions,
} from "../../domain/market/marketPriceEngine.js";

const MARKET_ANALYSIS_CACHE_TTL_MS = 60 * 1000;
const marketAnalysisCache = new Map();

const getStableQueryKey = (query) =>
  Object.keys(query)
    .sort()
    .map((key) => `${key}:${query[key]}`)
    .join("|");

export const getCachedMarketAnalysis = async (itemId, query) => {
  const bypassCache = query.fresh === "1" || query.noCache === "1";
  const cacheTtlMs = query.cacheTtl === "4" ? 4 * 1000 : MARKET_ANALYSIS_CACHE_TTL_MS;
  const cacheMaxAge = Math.max(0, Math.floor(cacheTtlMs / 1000));
  const cacheKey = `${itemId}:${getStableQueryKey(query)}`;
  const cached = marketAnalysisCache.get(cacheKey);

  if (!bypassCache && cached && Date.now() - cached.createdAt < cacheTtlMs) {
    return {
      analysis: cached.analysis,
      cacheControl: `private, max-age=${cacheMaxAge}`,
    };
  }

  const parsedOptions = parseMarketAnalysisOptions(query);
  const analysis = await buildMarketAnalysis(itemId, parsedOptions);

  if (!bypassCache) {
    marketAnalysisCache.set(cacheKey, { analysis, createdAt: Date.now() });
    if (marketAnalysisCache.size > 300) {
      const oldestKey = marketAnalysisCache.keys().next().value;
      marketAnalysisCache.delete(oldestKey);
    }
  }

  return {
    analysis,
    cacheControl: bypassCache ? "no-store" : `private, max-age=${cacheMaxAge}`,
  };
};
