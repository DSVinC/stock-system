const { createRequire } = require('node:module');
const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');

const router = express.Router();

const STOCK_LIBRARY = {
  AI算力: [
    { name: "中际旭创", code: "300308.SZ", score: 5, decision: "买入" },
    { name: "浪潮信息", code: "000977.SZ", score: 4, decision: "买入" },
    { name: "工业富联", code: "601138.SH", score: 4, decision: "观望" },
  ],
  机器人: [
    { name: "汇川技术", code: "300124.SZ", score: 5, decision: "买入" },
    { name: "埃斯顿", code: "002747.SZ", score: 4, decision: "观望" },
    { name: "绿的谐波", code: "688017.SH", score: 4, decision: "观望" },
  ],
  半导体: [
    { name: "北方华创", code: "002371.SZ", score: 5, decision: "买入" },
    { name: "中微公司", code: "688012.SH", score: 5, decision: "买入" },
    { name: "兆易创新", code: "603986.SH", score: 4, decision: "观望" },
  ],
  新能源: [
    { name: "宁德时代", code: "300750.SZ", score: 4, decision: "观望" },
    { name: "阳光电源", code: "300274.SZ", score: 4, decision: "买入" },
    { name: "德业股份", code: "605117.SH", score: 4, decision: "观望" },
  ],
  创新药: [
    { name: "恒瑞医药", code: "600276.SH", score: 4, decision: "买入" },
    { name: "百济神州", code: "688235.SH", score: 4, decision: "观望" },
    { name: "科伦药业", code: "002422.SZ", score: 4, decision: "观望" },
  ],
};

const DEFAULT_STOCKS = [
  { name: "贵州茅台", code: "600519.SH", score: 4, decision: "观望" },
  { name: "美的集团", code: "000333.SZ", score: 4, decision: "买入" },
  { name: "招商银行", code: "600036.SH", score: 3, decision: "观望" },
];

function normalizeDirections(input) {
  if (!input) return [];
  if (!Array.isArray(input)) return [];

  return [...new Set(input.map((item) => String(item).trim()).filter(Boolean))];
}

function scoreStocks(directions) {
  const resultMap = new Map();

  for (const direction of directions) {
    const matches = STOCK_LIBRARY[direction] || [];
    for (const stock of matches) {
      const current = resultMap.get(stock.code);
      if (!current) {
        resultMap.set(stock.code, {
          ...stock,
          matchedDirections: [direction],
        });
        continue;
      }

      current.score = Math.min(5, Math.max(current.score, stock.score));
      current.decision = current.decision === "买入" || stock.decision !== "买入" ? current.decision : stock.decision;
      current.matchedDirections.push(direction);
    }
  }

  const stocks = Array.from(resultMap.values());
  if (stocks.length === 0) {
    return DEFAULT_STOCKS;
  }

  return stocks
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.code.localeCompare(right.code, "zh-CN");
    })
    .slice(0, 8)
    .map(({ matchedDirections, ...stock }) => stock);
}

function analyzeHandler(req, res) {
  const directions = normalizeDirections(req.body && req.body.directions);

  if (directions.length === 0) {
    return res.status(400).json({
      error: "directions is required",
      stocks: [],
    });
  }

  const stocks = scoreStocks(directions);
  return res.json({ stocks });
}

router.post("/", analyzeHandler);

router.analyzeHandler = analyzeHandler;
module.exports = router;

if (require.main === module) {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use("/api/analyze", router);
  app.listen(port, () => {
    console.log(`analyze api listening on http://localhost:${port}/api/analyze`);
  });
}
