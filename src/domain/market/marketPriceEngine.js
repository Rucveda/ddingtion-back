import prisma from "../../db.js";
import {
  ISLAND_ENHANCE_TABLE,
  RPG_ENHANCE_DATA,
  RPG_SKILL_COMMON_RATES,
  SKILL_SLOT_SEAL_COSTS,
  RPG_SKILL_SYSTEM,
} from "./enhanceTables.js";

const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeOptions = (options = {}) => ({
  enhancementLevel: toFiniteNumber(options.enhancementLevel, 0),
  enhancementRank: options.enhancementRank || "입문",
  enchantments: options.enchantments || null,
  imprint: options.imprint || options.imprints || null,
  skills: options.skills || null,
  runes: Array.isArray(options.runes) ? options.runes : null,
});

const ensureMarketContext = async (itemId, context) => {
  if (!context.item) {
    context.item = await prisma.item.findUnique({ where: { id: itemId } });
  }
  if (!context.varMap) {
    const vars = await prisma.marketVariable.findMany();
    context.varMap = new Map(vars.map((v) => [v.key, v.value]));
  }
  if (!context.usedKeys) context.usedKeys = new Set();
  if (!context.missingKeys) context.missingKeys = new Set();
};

const getMarketValue = (context, key, fallback = 0) => {
  context.usedKeys?.add(key);
  if (!context.varMap?.has(key)) {
    context.missingKeys?.add(key);
    return fallback;
  }
  return toFiniteNumber(context.varMap.get(key), fallback);
};

const addCost = (breakdown, key, value) => {
  breakdown[key] = (breakdown[key] || 0) + value;
};

const calculateIslandImprintCost = (imprints, getV, breakdown) => {
  if (!imprints) return 0;
  const CONTRACT_PER_LEVEL = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 };
  const SUCCESS_RATE = 0.05;
  const ATTEMPTS_REQUIRED = 1 / SUCCESS_RATE;

  const contractPrice = getV("MAT_ISLAND_CONTRACT");
  let totalCost = 0;

  Object.entries(imprints).forEach(([name, level]) => {
    const costPerAttempt = getV(`MAT_SCROLL_투박한_${name}`) + CONTRACT_PER_LEVEL[level] * contractPrice;
    const cost = costPerAttempt * ATTEMPTS_REQUIRED;
    totalCost += cost;
    addCost(breakdown, "imprintCost", cost);
  });

  return totalCost;
};

const calculateRPGSkillCost = (weaponName, skills, getV, breakdown) => {
  if (!skills || Object.keys(skills).length === 0) return 0;

  const weaponType = ["스태프", "망치", "총", "활", "창", "대검"].find((t) => weaponName.includes(t));
  if (!weaponType) return 0;

  const skillConfig = RPG_SKILL_SYSTEM[weaponType];
  if (!skillConfig) return 0;

  let totalSkillCost = 0;
  const skillCount = Object.keys(skills).length;

  let totalSealNeeded = 0;
  for (let i = 0; i < skillCount; i++) {
    totalSealNeeded += SKILL_SLOT_SEAL_COSTS[i] || 0;
  }
  const slotCost = totalSealNeeded * getV("MAT_RPG_해방의 인장");
  totalSkillCost += slotCost;
  addCost(breakdown, "skillSlotCost", slotCost);

  const emblemPrice = getV("MAT_RPG_개방의 문장");
  const awakenStonePrice = getV(`MAT_RPG_${skillConfig.material}`);

  Object.entries(skills).forEach(([skillName, level]) => {
    const info = skillConfig.skills[skillName];
    if (!info) return;
    const unlockCost = info.emblem * emblemPrice + info.unlockGold;
    totalSkillCost += unlockCost;
    addCost(breakdown, "skillUnlockCost", unlockCost);
    for (let i = 0; i < level; i++) {
      const tryCost = info.enhanceGold[i] + awakenStonePrice;
      const enhanceCost = tryCost * (100 / RPG_SKILL_COMMON_RATES[i]);
      totalSkillCost += enhanceCost;
      addCost(breakdown, "skillEnhanceCost", enhanceCost);
    }
  });

  return totalSkillCost;
};

const getFairPriceDetails = async (itemId, rawOptions, context = {}) => {
  await ensureMarketContext(itemId, context);
  const item = context.item;
  if (!item) {
    return { price: 0, breakdown: { totalBuildCost: 0 }, missingKeys: [] };
  }

  const options = normalizeOptions(rawOptions);
  const getV = (key, fallback = 0) => getMarketValue(context, key, fallback);
  let buildCost = 0;
  const breakdown = {
    basePrice: 0,
    enchantCost: 0,
    imprintCost: 0,
    enhancementCost: 0,
    skillSlotCost: 0,
    skillUnlockCost: 0,
    skillEnhanceCost: 0,
    runeCost: 0,
    totalBuildCost: 0,
  };
  const category = item.category.toUpperCase();

  if (category.includes("WILD")) {
    if (options.enchantments) {
      Object.entries(options.enchantments).forEach(([name, level]) => {
        const HIGH_LIMITS = { 날카로움: 5, 미끼: 3, 보호: 4, 약탈: 3, 행운: 3, 효율: 5 };
        const normalMax = HIGH_LIMITS[name] || 5;
        const normalPrice = getV(`MAT_BOOK_${name}`);

        if (level <= normalMax) {
          const cost = normalPrice * 10 * level;
          buildCost += cost;
          addCost(breakdown, "enchantCost", cost);
        } else {
          const normalCost = normalPrice * 10 * normalMax;
          const highBookPrice = getV(`MAT_HIGH_BOOK_${name}`);
          const highRate = getV(`MAT_HIGH_RATE_${name}`, 10) || 10;
          const highCost = (highBookPrice / (highRate / 100)) * (level - normalMax);
          buildCost += normalCost + highCost;
          addCost(breakdown, "enchantCost", normalCost + highCost);
        }
      });
    }
  } else if (category.includes("ISLAND")) {
    buildCost += calculateIslandImprintCost(options.imprint, getV, breakdown);
    const stones = { low: getV("MAT_STONE_LOW"), mid: getV("MAT_STONE_MID"), high: getV("MAT_STONE_HIGH") };
    for (let i = 1; i <= (options.enhancementLevel || 0); i++) {
      const step = ISLAND_ENHANCE_TABLE[i - 1];
      if (!step) continue;
      const matCost = step.mats.low * stones.low + step.mats.mid * stones.mid + step.mats.high * stones.high;
      const cost = (step.gold + matCost) / (step.rate / 100);
      buildCost += cost;
      addCost(breakdown, "enhancementCost", cost);
    }
  } else if (category.includes("RPG")) {
    const weaponType = ["스태프", "망치", "총", "활", "창", "대검"].find((t) => item.name.includes(t));
    const dbBasePrice = weaponType ? getV(`MAT_RPG_BASE_${weaponType}`) : 0;
    const basePrice = dbBasePrice > 0 ? dbBasePrice : getV(`MAT_RPG_BASE_${options.enhancementRank || "입문"}`);
    buildCost = basePrice;
    breakdown.basePrice = basePrice;

    buildCost += calculateRPGSkillCost(item.name, options.skills, getV, breakdown);

    if (options.runes) {
      options.runes.forEach((r) => {
        if (r?.type && r?.grade) {
          const cost = getV(`MAT_RUNE_${r.type}_${r.grade}`);
          buildCost += cost;
          addCost(breakdown, "runeCost", cost);
        }
      });
    }

    const rank = options.enhancementRank || "입문";
    const steps = RPG_ENHANCE_DATA[rank] || [];
    for (let i = 0; i < (options.enhancementLevel || 0); i++) {
      const step = steps[i];
      if (!step) continue;
      let matTotal = 0;
      Object.entries(step.mats).forEach(([mName, count]) => {
        matTotal += getV(`MAT_RPG_${mName}`) * count;
      });
      const cost = step.gold + matTotal;
      buildCost += cost;
      addCost(breakdown, "enhancementCost", cost);
    }
  }

  breakdown.totalBuildCost = Math.round(buildCost);

  return {
    price: Math.round(buildCost),
    breakdown,
    missingKeys: Array.from(context.missingKeys || []),
  };
};

const getFairPrice = async (itemId, options, context = {}) => {
  const details = await getFairPriceDetails(itemId, options, context);
  return BigInt(Math.round(details.price));
};

const mapSimilarity = (target = {}, source = {}) => {
  const targetEntries = Object.entries(target || {}).filter(([, level]) => Number(level) > 0);
  const sourceEntries = Object.entries(source || {}).filter(([, level]) => Number(level) > 0);
  const keys = new Set([...targetEntries.map(([key]) => key), ...sourceEntries.map(([key]) => key)]);
  if (keys.size === 0) return 1;

  let overlap = 0;
  let union = 0;
  keys.forEach((key) => {
    const targetLevel = toFiniteNumber(target?.[key], 0);
    const sourceLevel = toFiniteNumber(source?.[key], 0);
    overlap += Math.min(targetLevel, sourceLevel);
    union += Math.max(targetLevel, sourceLevel);
  });

  return union > 0 ? overlap / union : 1;
};

const runeSimilarity = (targetRunes = [], sourceRunes = []) => {
  const toCounts = (runes) => {
    const counts = new Map();
    (Array.isArray(runes) ? runes : []).forEach((rune) => {
      if (!rune?.type) return;
      const key = `${rune.type}:${rune.grade || ""}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  };

  const targetCounts = toCounts(targetRunes);
  const sourceCounts = toCounts(sourceRunes);
  const keys = new Set([...targetCounts.keys(), ...sourceCounts.keys()]);
  if (keys.size === 0) return 1;

  let overlap = 0;
  let union = 0;
  keys.forEach((key) => {
    const targetCount = targetCounts.get(key) || 0;
    const sourceCount = sourceCounts.get(key) || 0;
    overlap += Math.min(targetCount, sourceCount);
    union += Math.max(targetCount, sourceCount);
  });

  return union > 0 ? overlap / union : 1;
};

const calculateOptionSimilarity = (targetRaw, sourceRaw, category = "") => {
  const target = normalizeOptions(targetRaw);
  const source = normalizeOptions(sourceRaw);
  const levelScore = Math.max(0, 1 - Math.abs(target.enhancementLevel - source.enhancementLevel) / 15);
  const rankScore = target.enhancementRank === source.enhancementRank ? 1 : 0;
  const enchantScore = mapSimilarity(target.enchantments, source.enchantments);
  const imprintScore = mapSimilarity(target.imprint, source.imprint);
  const skillScore = mapSimilarity(target.skills, source.skills);
  const runesScore = runeSimilarity(target.runes, source.runes);

  if (category.includes("WILD")) {
    return levelScore * 0.1 + enchantScore * 0.9;
  }
  if (category.includes("ISLAND")) {
    return levelScore * 0.45 + imprintScore * 0.55;
  }
  if (category.includes("RPG")) {
    return levelScore * 0.25 + rankScore * 0.1 + skillScore * 0.3 + runesScore * 0.25 + imprintScore * 0.1;
  }

  return levelScore;
};

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const filterOutlierEntries = (entries, getValue) => {
  if (entries.length < 5) {
    return { kept: entries, removed: [] };
  }

  const center = median(entries.map(getValue).filter((value) => value > 0));
  if (center <= 0) {
    return { kept: entries, removed: [] };
  }

  const min = center * 0.4;
  const max = center * 2.5;
  const kept = entries.filter((entry) => {
    const value = getValue(entry);
    return value >= min && value <= max;
  });

  return kept.length > 0
    ? { kept, removed: entries.filter((entry) => !kept.includes(entry)) }
    : { kept: entries, removed: [] };
};

const confidenceLabel = (score) => {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.45) return "MEDIUM";
  return "LOW";
};

const buildConfidence = ({ usedCount, candidateCount, avgSimilarity, missingCount, usedKeyCount, outlierRemovedCount }) => {
  const sampleScore = Math.min(1, usedCount / 8);
  const variableCompleteness = usedKeyCount > 0 ? Math.max(0, 1 - missingCount / usedKeyCount) : 1;
  const outlierStability = candidateCount > 0 ? Math.max(0.4, 1 - outlierRemovedCount / candidateCount) : 0.4;
  const score = sampleScore * 0.35 + avgSimilarity * 0.35 + variableCompleteness * 0.2 + outlierStability * 0.1;

  return {
    label: confidenceLabel(score),
    score: Number(score.toFixed(3)),
    factors: {
      sampleScore: Number(sampleScore.toFixed(3)),
      similarityScore: Number(avgSimilarity.toFixed(3)),
      variableCompleteness: Number(variableCompleteness.toFixed(3)),
      outlierStability: Number(outlierStability.toFixed(3)),
    },
  };
};

const getInferredPrice = async (itemId, targetOptions, context = {}) => {
  await ensureMarketContext(itemId, context);
  const item = context.item;
  const category = item?.category?.toUpperCase() || "";
  const targetDetails = await getFairPriceDetails(itemId, targetOptions, context);
  const recentTrades = await prisma.marketHistory.findMany({
    where: { itemId, isValid: true },
    orderBy: { tradeDate: "desc" },
    take: 20,
  });
  if (recentTrades.length === 0) {
    return null;
  }

  const scoredTrades = await Promise.all(recentTrades.map(async (trade, index) => {
    const similarity = calculateOptionSimilarity(targetOptions, trade, category);
    const baseDetails = await getFairPriceDetails(itemId, trade, context);
    const inferredPrice = Math.max(0, Number(trade.price) + (targetDetails.price - baseDetails.price));
    const recencyWeight = 1 / (1 + index * 0.18);
    const weight = recencyWeight * Math.max(0.2, similarity);

    return {
      trade,
      similarity,
      inferredPrice,
      baseCost: baseDetails.price,
      weight,
    };
  }));

  const similarCandidates = scoredTrades.filter((entry) => entry.similarity >= 0.35);
  const candidates = similarCandidates.length >= 3 ? similarCandidates : scoredTrades;
  const outlierResult = filterOutlierEntries(candidates, (entry) => entry.inferredPrice);
  const used = outlierResult.kept;
  const totalWeight = used.reduce((sum, entry) => sum + entry.weight, 0);
  const inferred = totalWeight > 0
    ? used.reduce((sum, entry) => sum + entry.inferredPrice * entry.weight, 0) / totalWeight
    : targetDetails.price;
  const avgSimilarity = used.length > 0
    ? used.reduce((sum, entry) => sum + entry.similarity, 0) / used.length
    : 0;

  return {
    price: Math.max(0, Math.round(inferred)),
    method: "INFERRED",
    targetBuildCost: targetDetails.price,
    usedTrades: used,
    outlierRemovedCount: outlierResult.removed.length,
    confidenceInput: {
      usedCount: used.length,
      candidateCount: candidates.length,
      avgSimilarity,
      missingCount: context.missingKeys?.size || 0,
      usedKeyCount: context.usedKeys?.size || 0,
      outlierRemovedCount: outlierResult.removed.length,
    },
    breakdown: {
      ...targetDetails.breakdown,
      inferredDelta: Math.round(inferred - targetDetails.price),
      inferredSampleCount: used.length,
      inferredAverageSimilarity: Number(avgSimilarity.toFixed(3)),
      outlierRemovedCount: outlierResult.removed.length,
    },
  };
};

export const parseMarketAnalysisOptions = (query) => {
  const { level, rank, enchantments, imprints, skills, runes } = query;
  return {
    enhancementLevel: parseInt(level) || 0,
    enhancementRank: rank || "입문",
    enchantments: enchantments ? JSON.parse(enchantments) : null,
    imprint: imprints ? JSON.parse(imprints) : null,
    skills: skills ? JSON.parse(skills) : null,
    runes: runes ? JSON.parse(runes) : null,
  };
};

export const buildMarketAnalysis = async (itemId, parsedOptions) => {
  const context = {};
  let result = await getInferredPrice(itemId, parsedOptions, context);
  if (result === null) {
    const details = await getFairPriceDetails(itemId, parsedOptions, context);
    result = {
      price: details.price,
      method: "BUILD_COST",
      targetBuildCost: details.price,
      usedTrades: [],
      outlierRemovedCount: 0,
      confidenceInput: {
        usedCount: 0,
        candidateCount: 0,
        avgSimilarity: 0,
        missingCount: context.missingKeys?.size || 0,
        usedKeyCount: context.usedKeys?.size || 0,
        outlierRemovedCount: 0,
      },
      breakdown: details.breakdown,
    };
  }

  const history = await prisma.marketHistory.findMany({
    where: { itemId, isValid: true },
    orderBy: { tradeDate: "desc" },
    take: 20,
  });
  const outlierHistory = filterOutlierEntries(history, (entry) => Number(entry.price));
  const avgHistory = outlierHistory.kept;
  const avgPrice = avgHistory.length > 0
    ? avgHistory.reduce((acc, curr) => acc + curr.price, 0n) / BigInt(avgHistory.length)
    : 0n;
  const warnings = [];
  const missingKeys = Array.from(context.missingKeys || []);

  if (missingKeys.length > 0) {
    warnings.push({
      type: "MISSING_MARKET_VARIABLES",
      message: "일부 시세 변수가 없어 0원으로 계산된 항목이 있습니다.",
      keys: missingKeys,
    });
  }
  if (result.method === "BUILD_COST") {
    warnings.push({
      type: "NO_TRADE_HISTORY",
      message: "유효 거래가 없어 직작 비용 기준으로만 추정했습니다.",
    });
  }
  if (result.outlierRemovedCount > 0 || outlierHistory.removed.length > 0) {
    warnings.push({
      type: "OUTLIERS_REMOVED",
      message: "평균 또는 추론 계산에서 극단 거래가 제외되었습니다.",
      inferredRemoved: result.outlierRemovedCount,
      averageRemoved: outlierHistory.removed.length,
    });
  }

  const confidence = buildConfidence(result.confidenceInput);

  return {
    fairPrice: String(result.price),
    avgPrice: avgPrice.toString(),
    history: history.map((t) => ({ ...t, price: t.price.toString() })),
    method: result.method,
    confidence,
    breakdown: {
      ...result.breakdown,
      averageSampleCount: avgHistory.length,
      averageOutlierRemovedCount: outlierHistory.removed.length,
    },
    warnings,
  };
};
