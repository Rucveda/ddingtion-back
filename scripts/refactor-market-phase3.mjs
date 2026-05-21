import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "src");
const servicePath = path.join(src, "services/marketAnalysisService.js");
const content = fs.readFileSync(servicePath, "utf8");

const tablesEnd = content.indexOf("const toFiniteNumber");
const tablesBlock = content.slice(0, tablesEnd).replace(/^import prisma.*\n\n/, "");

const engineStart = tablesEnd;
const engineEnd = content.indexOf("export const parseMarketAnalysisOptions");
const engineBlock = content.slice(engineStart, engineEnd);

const apiBlock = content.slice(engineEnd);

const enhanceTables = `${tablesBlock.trim()}\n\nexport {\n  ISLAND_ENHANCE_TABLE,\n  RPG_ENHANCE_DATA,\n  RPG_SKILL_COMMON_RATES,\n  SKILL_SLOT_SEAL_COSTS,\n  RPG_SKILL_SYSTEM,\n};\n`;

const engine = `import prisma from "../../db.js";
import {
  ISLAND_ENHANCE_TABLE,
  RPG_ENHANCE_DATA,
  RPG_SKILL_COMMON_RATES,
  SKILL_SLOT_SEAL_COSTS,
  RPG_SKILL_SYSTEM,
} from "./enhanceTables.js";

${engineBlock.trim()}
`;

const shim = `/** @deprecated import from domain/market/marketPriceEngine.js */
export {
  parseMarketAnalysisOptions,
  buildMarketAnalysis,
} from "../domain/market/marketPriceEngine.js";
`;

const domainDir = path.join(src, "domain/market");
fs.mkdirSync(domainDir, { recursive: true });
fs.writeFileSync(path.join(domainDir, "enhanceTables.js"), enhanceTables, "utf8");
fs.writeFileSync(path.join(domainDir, "marketPriceEngine.js"), engine + "\n" + apiBlock.trim() + "\n", "utf8");
fs.writeFileSync(servicePath, shim, "utf8");
console.log("market split ok");
