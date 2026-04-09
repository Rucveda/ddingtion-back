import 'dotenv/config';
import express from 'express';
import authenticateToken from '../middlewares/authMiddleware.js';
import prisma from '../db.js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const router = express.Router();

/**
 * 🛠️ [Redis 연결 패치]
 * Render 배포 환경(production)에서는 TLS 연결이 필요할 수 있습니다.
 * 또한 REDIS_URL이 없을 경우를 대비한 안전 장치를 추가합니다.
 */
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    // Render/Managed Redis 사용 시 필요할 수 있는 TLS 설정
    ...(redisUrl.includes('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});

const auctionQueue = new Queue('auctionQueue', { connection: redisConnection });

// --- 📊 [Constants] 마켓 데이터 동기화 (기존 코드 유지) ---
const ISLAND_ENHANCE_TABLE = [
    { lv: 1, gold: 5000, rate: 100, mats: { low: 1, mid: 0, high: 0 } },
    { lv: 2, gold: 25000, rate: 100, mats: { low: 2, mid: 0, high: 0 } },
    { lv: 3, gold: 50000, rate: 80, mats: { low: 2, mid: 0, high: 0 } },
    { lv: 4, gold: 100000, rate: 80, mats: { low: 3, mid: 1, high: 0 } },
    { lv: 5, gold: 130000, rate: 70, mats: { low: 3, mid: 1, high: 0 } },
    { lv: 6, gold: 150000, rate: 50, mats: { low: 4, mid: 2, high: 1 } },
    { lv: 7, gold: 170000, rate: 40, mats: { low: 4, mid: 2, high: 1 } },
    { lv: 8, gold: 300000, rate: 30, mats: { low: 6, mid: 3, high: 2 } },
    { lv: 9, gold: 350000, rate: 20, mats: { low: 6, mid: 3, high: 2 } },
    { lv: 10, gold: 500000, rate: 10, mats: { low: 8, mid: 4, high: 3 } },
    { lv: 11, gold: 700000, rate: 5, mats: { low: 8, mid: 4, high: 3 } },
    { lv: 12, gold: 1000000, rate: 3, mats: { low: 8, mid: 4, high: 3 } },
    { lv: 13, gold: 1300000, rate: 2, mats: { low: 10, mid: 6, high: 4 } },
    { lv: 14, gold: 1500000, rate: 1, mats: { low: 10, mid: 6, high: 4 } },
    { lv: 15, gold: 2000000, rate: 1, mats: { low: 10, mid: 6, high: 4 } },
];

const RPG_ENHANCE_DATA = {
    "입문": [
        { gold: 5000, mats: { "빛바랜 낙화": 5 } },
        { gold: 15000, mats: { "루미디아의 조각": 1, "빛바랜 낙화": 30 } },
        { gold: 35000, mats: { "루미디아의 조각": 7, "정제된 빛바랜 낙화": 2 } },
        { gold: 50000, mats: { "루미디아의 조각": 15, "미약한 격파석": 1, "정제된 빛바랜 낙화": 3, "벨페고르 코어": 1 } },
        { gold: 150000, mats: { "루미디아의 조각": 40, "미약한 격파석": 1, "선홍의 균사": 20, "벨페고르 코어": 3 } },
        { gold: 250000, mats: { "정제된 루미디아의 조각": 2, "미약한 격파석": 2, "선홍의 균사": 50, "벨페고르 코어": 5 } },
        { gold: 350000, mats: { "정제된 루미디아의 조각": 3, "미약한 격파석": 2, "정제된 선홍의 균사": 2, "앨런 코어": 2 } },
        { gold: 500000, mats: { "루미디아의 결정": 10, "미약한 격파석": 3, "고요한 포자": 40, "앨런 코어": 5 } },
        { gold: 1000000, mats: { "루미디아의 결정": 20, "미약한 격파석": 4, "정제된 고요한 포자": 2, "앨런 코어": 7 } },
        { gold: 1500000, mats: { "루미디아의 결정": 30, "미약한 격파석": 5, "정제된 고요한 포자": 4, "아가레스 코어": 3 } },
        { gold: 2500000, mats: { "루미디아의 결정": 45, "미약한 격파석": 6, "갈라진 암석": 25, "아가레스 코어": 7 } },
        { gold: 3500000, mats: { "루미디아의 결정": 60, "미약한 격파석": 7, "갈라진 암석": 50, "아가레스 코어": 10 } },
        { gold: 7000000, mats: { "정제된 루미디아의 결정": 2, "미약한 격파석": 8, "정제된 갈라진 암석": 3, "윈스톤 코어": 5 } },
        { gold: 10000000, mats: { "정제된 루미디아의 결정": 3, "미약한 격파석": 9, "정제된 갈라진 암석": 4, "윈스톤 코어": 10 } },
        { gold: 15000000, mats: { "정제된 루미디아의 결정": 4, "미약한 격파석": 10, "정제된 갈라진 암석": 9, "윈스톤 코어": 15 } }
    ],
    "견습": [
        { gold: 10000, mats: { "루미디아의 조각": 2, "빛바랜 낙화": 10 } },
        { gold: 25000, mats: { "루미디아의 조각": 14, "빛바랜 낙화": 60 } },
        { gold: 60000, mats: { "루미디아의 조각": 30, "정제된 빛바랜 낙화": 4 } },
        { gold: 90000, mats: { "정제된 루미디아의 조각": 2, "안정된 격파석": 1, "정제된 빛바랜 낙화": 6, "벨페고르 코어": 3 } },
        { gold: 220000, mats: { "정제된 루미디아의 조각": 4, "안정된 격파석": 1, "선홍의 균사": 40, "벨페고르 코어": 5 } },
        { gold: 360000, mats: { "정제된 루미디아의 조각": 6, "안정된 격파석": 2, "정제된 선홍의 균사": 2, "벨페고르 코어": 7 } },
        { gold: 520000, mats: { "루미디아의 결정": 20, "안정된 격파석": 2, "정제된 선홍의 균사": 4, "앨런 코어": 3 } },
        { gold: 750000, mats: { "루미디아의 결정": 40, "안정된 격파석": 3, "정제된 고요한 포자": 2, "앨런 코어": 7 } },
        { gold: 1400000, mats: { "루미디아의 결정": 60, "안정된 격파석": 4, "정제된 고요한 포자": 4, "앨런 코어": 10 } },
        { gold: 2100000, mats: { "정제된 루미디아의 결정": 2, "안정된 격파석": 5, "정제된 고요한 포자": 8, "아가레스 코어": 5 } },
        { gold: 3500000, mats: { "정제된 루미디아의 결정": 3, "안정된 격파석": 6, "갈라진 암석": 50, "아가레스 코어": 10 } },
        { gold: 7000000, mats: { "정제된 루미디아의 결정": 4, "안정된 격파석": 7, "정제된 갈라진 암석": 2, "아가레스 코어": 15 } },
        { gold: 10000000, mats: { "정제된 루미디아의 결정": 6, "안정된 격파석": 8, "정제된 갈라진 암석": 6, "윈스톤 코어": 10 } },
        { gold: 15000000, mats: { "정제된 루미디아의 결정": 8, "안정된 격파석": 9, "정제된 갈라진 암석": 8, "윈스톤 코어": 15 } },
        { gold: 20000000, mats: { "정제된 루미디아의 결정": 12, "안정된 격파석": 10, "정제된 갈라진 암석": 18, "윈스톤 코어": 20 } }
    ],
    "정예": [
        { gold: 15000, mats: { "루미디아의 조각": 4, "빛바랜 낙화": 20 } },
        { gold: 40000, mats: { "루미디아의 조각": 28, "정제된 빛바랜 낙화": 3 } },
        { gold: 90000, mats: { "루미디아의 조각": 60, "정제된 빛바랜 낙화": 8 } },
        { gold: 130000, mats: { "정제된 루미디아의 조각": 4, "강화된 격파석": 1, "정제된 빛바랜 낙화": 12, "벨페고르 코어": 5 } },
        { gold: 300000, mats: { "정제된 루미디아의 조각": 8, "강화된 격파석": 1, "정제된 선홍의 균사": 2, "벨페고르 코어": 10 } },
        { gold: 500000, mats: { "정제된 루미디아의 조각": 12, "강화된 격파석": 2, "정제된 선홍의 균사": 5, "벨페고르 코어": 15 } },
        { gold: 700000, mats: { "루미디아의 결정": 40, "강화된 격파석": 2, "정제된 선홍의 균사": 8, "앨런 코어": 7 } },
        { gold: 1000000, mats: { "정제된 루미디아의 결정": 2, "강화된 격파석": 3, "정제된 고요한 포자": 4, "앨런 코어": 13 } },
        { gold: 2000000, mats: { "정제된 루미디아의 결정": 3, "강화된 격파석": 4, "정제된 고요한 포자": 8, "앨런 코어": 20 } },
        { gold: 3000000, mats: { "정제된 루미디아의 결정": 4, "강화된 격파석": 5, "정제된 고요한 포자": 16, "아가레스 코어": 10 } },
        { gold: 5000000, mats: { "정제된 루미디아의 결정": 6, "강화된 격파석": 6, "정제된 갈라진 암석": 2, "아가레스 코어": 20 } },
        { gold: 7000000, mats: { "정제된 루미디아의 결정": 8, "강화된 격파석": 7, "정제된 갈라진 암석": 5, "아가레스 코어": 30 } },
        { gold: 13000000, mats: { "정제된 루미디아의 결정": 12, "강화된 격파석": 8, "정제된 갈라진 암석": 12, "윈스톤 코어": 20 } },
        { gold: 17000000, mats: { "정제된 루미디아의 결정": 16, "강화된 격파석": 9, "정제된 갈라진 암석": 16, "윈스톤 코어": 30 } },
        { gold: 23000000, mats: { "정제된 루미디아의 결정": 24, "강화된 격파석": 10, "정제된 갈라진 암석": 36, "윈스톤 코어": 40 } }
    ],
    "영웅": [
        { gold: 30000, mats: { "루미디아의 조각": 8, "빛바랜 낙화": 35 } },
        { gold: 70000, mats: { "루미디아의 조각": 56, "정제된 빛바랜 낙화": 5 } },
        { gold: 150000, mats: { "정제된 루미디아의 조각": 3, "정제된 빛바랜 낙화": 14 } },
        { gold: 200000, mats: { "정제된 루미디아의 조각": 8, "완성된 격파석": 1, "정제된 빛바랜 낙화": 21, "벨페고르 코어": 10 } },
        { gold: 500000, mats: { "정제된 루미디아의 조각": 16, "완성된 격파석": 1, "정제된 선홍의 균사": 3, "벨페고르 코어": 15 } },
        { gold: 700000, mats: { "정제된 루미디아의 조각": 24, "완성된 격파석": 2, "정제된 선홍의 균사": 9, "벨페고르 코어": 20 } },
        { gold: 1000000, mats: { "정제된 루미디아의 결정": 2, "완성된 격파석": 2, "정제된 선홍의 균사": 14, "앨런 코어": 10 } },
        { gold: 1500000, mats: { "정제된 루미디아의 결정": 4, "완성된 격파석": 3, "정제된 고요한 포자": 7, "앨런 코어": 20 } },
        { gold: 3000000, mats: { "정제된 루미디아의 결정": 6, "완성된 격파석": 4, "정제된 고요한 포자": 14, "앨런 코어": 30 } },
        { gold: 5000000, mats: { "정제된 루미디아의 결정": 8, "완성된 격파석": 5, "정제된 고요한 포자": 28, "아가레스 코어": 15 } },
        { gold: 7000000, mats: { "정제된 루미디아의 결정": 12, "완성된 격파석": 6, "정제된 갈라진 암석": 4, "아가레스 코어": 30 } },
        { gold: 10000000, mats: { "정제된 루미디아의 결정": 16, "완성된 격파석": 7, "정제된 갈라진 암석": 9, "아가레스 코어": 50 } },
        { gold: 15000000, mats: { "정제된 루미디아의 결정": 24, "완성된 격파석": 8, "정제된 갈라진 암석": 21, "윈스톤 코어": 20 } },
        { gold: 23000000, mats: { "정제된 루미디아의 결정": 32, "완성된 격파석": 9, "정제된 갈라진 암석": 28, "윈스톤 코어": 40 } },
        { gold: 27000000, mats: { "정제된 루미디아의 결정": 48, "완성된 격파석": 10, "정제된 갈라진 암석": 63, "윈스톤 코어": 60 } }
    ]
};

const RPG_WEAPON_META = {
    "스태프": "입문", "망치": "입문",
    "총": "견습",
    "활": "정예", "창": "정예",
    "대검": "영웅"
};

const RPG_SKILL_COMMON_RATES = [90, 80, 70, 50, 20, 10, 5];
const SKILL_SLOT_SEAL_COSTS = [1, 3, 5, 10]; 

const RPG_SKILL_SYSTEM = {
    "스태프": {
        material: "미약한 각성석",
        skills: {
            "리프시커": { emblem: 1, unlockGold: 30000, enhanceGold: [1500, 3500, 7000, 10000, 17500, 24000, 35000] },
            "바인크리프": { emblem: 3, unlockGold: 50000, enhanceGold: [2500, 5500, 11000, 19500, 35000, 48500, 70000] },
            "우드서지": { emblem: 5, unlockGold: 70000, enhanceGold: [3500, 8500, 17500, 31000, 56000, 83500, 125000] },
            "버던트메테오": { emblem: 7, unlockGold: 100000, enhanceGold: [5500, 12500, 24500, 48500, 83500, 125500, 210000] },
            "그로브클랩": { emblem: 10, unlockGold: 300000, enhanceGold: [8500, 17500, 35000, 62500, 105000, 153500, 245000] },
        }
    },
    "망치": {
        material: "미약한 각성석",
        skills: {
            "스틸임팩트": { emblem: 3, unlockGold: 50000, enhanceGold: [1500, 3500, 7000, 10000, 17500, 24000, 35000] },
            "헤비사이클론": { emblem: 5, unlockGold: 70000, enhanceGold: [2500, 5500, 11000, 19500, 35000, 48500, 70000] },
            "그랜드크러시": { emblem: 7, unlockGold: 100000, enhanceGold: [3500, 8500, 17500, 31000, 56000, 83500, 125000] },
            "오리진이지스": { emblem: 10, unlockGold: 300000, enhanceGold: [5500, 12500, 24500, 48500, 83500, 125500, 210000] },
            "팔라딘저지먼트": { emblem: 15, unlockGold: 500000, enhanceGold: [8500, 17500, 35000, 62500, 105000, 153500, 245000] },
        }
    },
    "총": {
        material: "안정된 각성석",
        skills: {
            "에너지버스트": { emblem: 5, unlockGold: 70000, enhanceGold: [2000, 4500, 9000, 13000, 23000, 31500, 46000] },
            "브로드샷": { emblem: 7, unlockGold: 100000, enhanceGold: [3500, 7500, 14500, 22500, 45500, 63500, 92000] },
            "락온트리거": { emblem: 10, unlockGold: 300000, enhanceGold: [5000, 11500, 23500, 40500, 72500, 108500, 162000] },
            "펄스레이닝": { emblem: 15, unlockGold: 500000, enhanceGold: [7500, 17500, 33500, 63500, 108500, 162500, 273000] },
            "오버클럭프로토콜": { emblem: 20, unlockGold: 700000, enhanceGold: [11000, 24500, 47000, 81500, 136500, 198500, 318500] },
        }
    },
    "활": {
        material: "강화된 각성석",
        skills: {
            "차지블로우": { emblem: 10, unlockGold: 100000, enhanceGold: [2500, 5500, 11000, 16000, 28000, 38000, 55000] },
            "스위프트샷": { emblem: 15, unlockGold: 300000, enhanceGold: [4500, 9000, 17500, 31000, 56000, 77500, 110000] },
            "컨비전스스플릿": { emblem: 20, unlockGold: 500000, enhanceGold: [6500, 13500, 28500, 49500, 89000, 133000, 199500] },
            "리니어레인": { emblem: 30, unlockGold: 700000, enhanceGold: [9500, 20500, 40500, 77500, 133000, 199500, 335000] },
            "세라핌디센트": { emblem: 50, unlockGold: 1000000, enhanceGold: [13500, 28500, 57000, 99500, 167000, 244000, 390000] },
        }
    },
    "창": {
        material: "강화된 각성석",
        skills: {
            "피어스폴": { emblem: 10, unlockGold: 100000, enhanceGold: [2500, 5500, 11000, 16000, 28000, 38000, 55000] },
            "스러스트러시": { emblem: 15, unlockGold: 300000, enhanceGold: [4500, 9000, 17500, 31000, 56000, 77500, 110000] },
            "플리커랜서": { emblem: 20, unlockGold: 500000, enhanceGold: [6500, 13500, 28500, 49500, 89000, 133000, 199500] },
            "프로스트드롭": { emblem: 30, unlockGold: 700000, enhanceGold: [9500, 20500, 40500, 77500, 133000, 199500, 335000] },
            "앱솔루트도미니온": { emblem: 50, unlockGold: 1000000, enhanceGold: [13500, 28500, 57000, 99500, 167000, 244000, 390000] },
        }
    },
    "대검": {
        material: "완성된 각성석",
        skills: {
            "플래임슬래시": { emblem: 20, unlockGold: 150000, enhanceGold: [3500, 7500, 15000, 22000, 38500, 52000, 75000] },
            "리버스커터": { emblem: 30, unlockGold: 500000, enhanceGold: [6000, 12000, 23500, 41000, 77500, 103000, 150000] },
            "업리프트임팩트": { emblem: 40, unlockGold: 700000, enhanceGold: [8500, 18500, 38500, 66000, 123000, 183500, 275000] },
            "드래곤이그니션": { emblem: 50, unlockGold: 1000000, enhanceGold: [12500, 27500, 55000, 103000, 183500, 275000, 460000] },
            "와이번어웨이크": { emblem: 60, unlockGold: 1500000, enhanceGold: [18000, 38500, 77500, 132000, 231000, 336000, 535000] },
        }
    }
};

// --- 🧠 [Inference Engine] 시세 계산 및 추론 로직 (기존 코드 유지) ---

const calculateIslandImprintCost = (imprints, getV) => {
    if (!imprints) return 0;
    const CONTRACT_PER_LEVEL = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 };
    const SUCCESS_RATE = 0.05; 
    const ATTEMPTS_REQUIRED = 1 / SUCCESS_RATE; 

    const contractPrice = getV("MAT_ISLAND_CONTRACT");
    let totalCost = 0;

    Object.entries(imprints).forEach(([name, level]) => {
        const stonePrice = getV(`MAT_SCROLL_투박한_${name}`);
        const costPerAttempt = stonePrice + (CONTRACT_PER_LEVEL[level] * contractPrice);
        totalCost += (costPerAttempt * ATTEMPTS_REQUIRED);
    });

    return totalCost;
};

const calculateRPGSkillCost = (weaponName, skills, getV) => {
    if (!skills || Object.keys(skills).length === 0) return 0;

    const weaponType = Object.keys(RPG_SKILL_SYSTEM).find(key => weaponName.includes(key));
    const skillConfig = RPG_SKILL_SYSTEM[weaponType];
    if (!skillConfig) return 0;

    let totalSkillCost = 0;
    
    const skillCount = Object.keys(skills).length;
    const sealPrice = getV("MAT_RPG_해방의 인장");
    let totalSealNeeded = 0;
    for (let i = 0; i < skillCount; i++) {
        totalSealNeeded += (SKILL_SLOT_SEAL_COSTS[i] || 0);
    }
    totalSkillCost += (totalSealNeeded * sealPrice);

    const emblemPrice = getV("MAT_RPG_개방의 문장");
    const awakenStonePrice = getV(`MAT_RPG_${skillConfig.material}`);

    Object.entries(skills).forEach(([skillName, level]) => {
        const info = skillConfig.skills[skillName];
        if (info) {
            totalSkillCost += (info.emblem * emblemPrice) + info.unlockGold;
            for (let i = 0; i < level; i++) {
                const tryCost = info.enhanceGold[i] + awakenStonePrice;
                totalSkillCost += tryCost * (100 / RPG_SKILL_COMMON_RATES[i]);
            }
        }
    });

    return totalSkillCost;
};

const getFairPrice = async (itemId, options) => {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return 0n;

    const vars = await prisma.marketVariable.findMany();
    const getV = (key) => vars.find(v => v.key === key)?.value || 0;

    let buildCost = 0;
    const category = item.category.toUpperCase();

    if (category.includes("WILD")) {
        if (options.enchantments) {
            Object.entries(options.enchantments).forEach(([name, tier]) => {
                const pricePer10Percent = getV(`MAT_BOOK_${name}`);
                buildCost += (pricePer10Percent * 10) * tier;
            });
        }
    } 
    else if (category.includes("ISLAND")) {
        buildCost += calculateIslandImprintCost(options.imprint, getV);
        const stones = { low: getV("MAT_STONE_LOW"), mid: getV("MAT_STONE_MID"), high: getV("MAT_STONE_HIGH") };
        for (let i = 1; i <= (options.enhancementLevel || 0); i++) {
            const step = ISLAND_ENHANCE_TABLE[i - 1];
            if (!step) continue;
            const matCost = (step.mats.low * stones.low) + (step.mats.mid * stones.mid) + (step.mats.high * stones.high);
            buildCost += (step.gold + matCost) / (step.rate / 100);
        }
    } 
    else if (category.includes("RPG")) {
        const dbBasePrice = getV(`MAT_RPG_BASE_${item.name}`);
        buildCost = dbBasePrice > 0 ? dbBasePrice : getV(`MAT_RPG_BASE_${RPG_WEAPON_META[item.name] || "입문"}`);

        buildCost += calculateRPGSkillCost(item.name, options.skills, getV);

        if (options.runes) {
            options.runes.forEach((r) => { 
                if (r?.type && r?.grade) buildCost += getV(`MAT_RUNE_${r.type}_${r.grade}`);
            });
        }

        const rank = RPG_WEAPON_META[item.name] || options.enhancementRank || "입문";
        const steps = RPG_ENHANCE_DATA[rank] || [];
        for (let i = 0; i < (options.enhancementLevel || 0); i++) {
            const step = steps[i];
            if (step) {
                let matTotal = 0;
                Object.entries(step.mats).forEach(([mName, count]) => {
                    matTotal += (getV(`MAT_RPG_${mName}`) * count);
                });
                buildCost += (step.gold + matTotal);
            }
        }
    }

    return BigInt(Math.round(buildCost));
};

const getInferredPrice = async (itemId, targetOptions) => {
    const similarTrades = await prisma.marketHistory.findMany({
        where: { itemId, isValid: true },
        orderBy: { tradeDate: 'desc' },
        take: 10
    });

    if (similarTrades.length === 0) return null;

    const baseTrade = similarTrades[0];
    const targetCost = Number(await getFairPrice(itemId, targetOptions));
    const baseCost = Number(await getFairPrice(itemId, baseTrade));

    const delta = targetCost - baseCost;
    const inferred = Number(baseTrade.price) + delta;

    return BigInt(Math.max(0, Math.round(inferred)));
};

// --- 🌐 [Router] API 엔드포인트 ---

router.get('/items', authenticateToken, async (req, res) => {
    try {
        const items = await prisma.item.findMany({ orderBy: { name: 'asc' } });
        res.json(items);
    } catch (error) {
        res.status(500).json([]);
    }
});

router.get('/market-analysis/:itemId', async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId);
        if (isNaN(itemId)) return res.status(400).json({ error: "유효하지 않은 아이템 ID" });

        const { level, rank, enchantments, imprints, skills, runes } = req.query;

        const parsedOptions = {
            enhancementLevel: parseInt(level) || 0,
            enhancementRank: rank || "입문",
            enchantments: enchantments ? JSON.parse(enchantments) : null,
            imprint: imprints ? JSON.parse(imprints) : null,
            skills: skills ? JSON.parse(skills) : null,
            runes: runes ? JSON.parse(runes) : null
        };

        let fairPrice = await getInferredPrice(itemId, parsedOptions);
        if (fairPrice === null) fairPrice = await getFairPrice(itemId, parsedOptions);

        const history = await prisma.marketHistory.findMany({
            where: { itemId, isValid: true },
            orderBy: { tradeDate: 'desc' },
            take: 20
        });

        res.json({
            fairPrice: fairPrice.toString(),
            avgPrice: history.length > 0 ? (history.reduce((acc, curr) => acc + curr.price, 0n) / BigInt(history.length)).toString() : "0",
            history: history.map(t => ({ ...t, price: t.price.toString() }))
        });
    } catch (error) {
        res.status(500).json({ error: "분석 생성 실패" });
    }
});

router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const auctions = await prisma.auction.findMany({
            where: { status: 'ACTIVE', endTime: { gt: now } },
            include: {
                item: true,
                seller: { select: { id: true, ingameName: true, reputationScore: true } }
            },
            orderBy: { endTime: 'asc' }
        });
        
        const safeData = auctions.map(a => ({
            ...a,
            startPrice: a.startPrice.toString(),
            currentPrice: a.currentPrice.toString(),
            buyNowPrice: a.buyNowPrice?.toString() || null
        }));

        res.status(200).json(Array.isArray(safeData) ? safeData : []);
    } catch (error) {
        res.status(200).json([]);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const auctionId = parseInt(req.params.id);
        if (isNaN(auctionId)) return res.status(400).json({ error: "유효하지 않은 경매 ID" });

        const auction = await prisma.auction.findUnique({
            where: { id: auctionId },
            include: {
                item: true,
                seller: { select: { id: true, ingameName: true, reputationScore: true, reviewCount: true } },
                bids: {
                    orderBy: { bidAmount: 'desc' },
                    take: 1,
                    include: { bidder: { select: { ingameName: true } } }
                }
            }
        });

        if (!auction) return res.status(404).json({ error: "경매 없음" });

        res.json({
            ...auction,
            startPrice: auction.startPrice.toString(),
            currentPrice: auction.currentPrice.toString(),
            buyNowPrice: auction.buyNowPrice?.toString() || null,
            lastBidder: auction.bids[0]?.bidder.ingameName || "없음"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "조회 실패" });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { itemId, startPrice, buyNowPrice, durationHours, enhancementLevel, enhancementRank, enchantments, imprints, skills, runes } = req.body;
        const endTime = new Date();
        endTime.setHours(endTime.getHours() + (parseInt(durationHours) || 24));

        const newAuction = await prisma.auction.create({
            data: {
                sellerId: req.user.id,
                itemId: parseInt(itemId),
                startPrice: BigInt(startPrice),
                currentPrice: BigInt(startPrice),
                buyNowPrice: buyNowPrice ? BigInt(buyNowPrice) : null,
                endTime,
                status: 'ACTIVE',
                enhancementLevel: parseInt(enhancementLevel) || 0,
                enhancementRank,
                enchantments,
                imprint: imprints,
                skills,
                runes
            }
        });

        await auctionQueue.add('endAuction', { auctionId: newAuction.id }, { delay: (parseInt(durationHours) || 24) * 3600000 });
        res.status(201).json({ ...newAuction, id: newAuction.id.toString(), startPrice: newAuction.startPrice.toString(), currentPrice: newAuction.currentPrice.toString() });
    } catch (error) {
        res.status(500).json({ error: "등록 실패" });
    }
});

router.post('/:id/buy', authenticateToken, async (req, res) => {
    try {
        const auctionId = parseInt(req.params.id);
        const auction = await prisma.auction.findUnique({ where: { id: auctionId } });

        if (!auction || auction.status !== 'ACTIVE') return res.status(400).json({ error: "무효한 경매" });

        const [updated, , room] = await prisma.$transaction([
            prisma.auction.update({ where: { id: auctionId }, data: { status: 'COMPLETED', currentPrice: auction.buyNowPrice } }),
            prisma.bid.create({ data: { auctionId, bidderId: req.user.id, bidAmount: auction.buyNowPrice } }),
            prisma.chatRoom.create({ data: { auctionId, sellerId: auction.sellerId, buyerId: req.user.id } }),
            prisma.marketHistory.create({
                data: {
                    itemId: auction.itemId,
                    enhancementLevel: auction.enhancementLevel,
                    enhancementRank: auction.enhancementRank,
                    enchantments: auction.enchantments,
                    imprint: auction.imprint,
                    skills: auction.skills,
                    runes: auction.runes,
                    price: auction.buyNowPrice,
                    isValid: true
                }
            })
        ]);

        res.json({ message: "완료", roomId: room.id });
    } catch (error) {
        res.status(500).json({ error: "처리 실패" });
    }
});

export default router;