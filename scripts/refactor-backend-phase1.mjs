import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "src");

const copyWithImports = (fromRel, toRel, replacements) => {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);
  let content = fs.readFileSync(from, "utf8");
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, content, "utf8");
  const shimPath = fromRel.replace(/^lib\//, "../domain/").replace(/([^/]+)\.js$/, (_, name) => {
    const dir = toRel.replace(/\/[^/]+$/, "");
    return `../${dir}/${name}.js`;
  });
  // shim: lib/foo.js -> ../domain/.../foo.js
  const depth = fromRel.startsWith("lib/") ? `../${toRel}` : null;
  if (depth) {
    fs.writeFileSync(from, `/** @deprecated import from ${toRel} */\nexport * from "../${toRel}";\n`, "utf8");
  }
};

const moves = [
  {
    from: "lib/bidIncrement.js",
    to: "domain/auction/bidIncrement.js",
    replace: [],
  },
  {
    from: "lib/postCategories.js",
    to: "domain/posts/postCategories.js",
    replace: [],
  },
  {
    from: "lib/postCategoryGuides.js",
    to: "domain/posts/postCategoryGuides.js",
    replace: [
      ['from "../db.js"', 'from "../../db.js"'],
      ['from "./postCategories.js"', 'from "./postCategories.js"'],
    ],
  },
  {
    from: "lib/auctionCancel.js",
    to: "domain/auction/auctionCancel.js",
    replace: [
      ['from "../db.js"', 'from "../../db.js"'],
      ['from "./auctionQueueJobs.js"', 'from "../../lib/auctionQueueJobs.js"'],
      ['from "../services/auctionTradeService.js"', 'from "../../services/auctionTradeService.js"'],
    ],
  },
  {
    from: "lib/tradeReport.js",
    to: "domain/trade/tradeReport.js",
    replace: [
      ['from "../db.js"', 'from "../../db.js"'],
      ['from "./auctionCancel.js"', 'from "../auction/auctionCancel.js"'],
    ],
  },
];

for (const { from, to, replace } of moves) {
  const fromPath = path.join(root, from);
  const toPath = path.join(root, to);
  let content = fs.readFileSync(fromPath, "utf8");
  for (const [a, b] of replace) {
    content = content.split(a).join(b);
  }
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.writeFileSync(toPath, content, "utf8");
  fs.writeFileSync(
    fromPath,
    `/** Legacy shim — use ${to} */\nexport * from "../${to}";\n`,
    "utf8",
  );
  console.log("moved", from, "->", to);
}

console.log("phase1 domain moves done");
