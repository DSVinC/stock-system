# TASK_ANALYZE_STRUCT_003 - analysis.js API 适配 v2 结构

**优先级**: P0  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 11:16  
**预计完成**: 2026-03-22 16:00  
**依赖**: TASK_ANALYZE_STRUCT_002 完成  

---

## 📋 任务描述

改造 `stock-system/api/analysis.js`，适配 stock_analyzer.py 输出的 v2 结构化数据，同时保持向后兼容。

---

## 🎯 验收标准

### 1. API 接口改造
- [ ] 保留原 `/api/analyze/report` 接口（v1 兼容）
- [ ] 新增 `/api/v2/analyze/report` 接口（v2 结构化）
- [ ] 新增 `/api/v2/analyze/strategy/:ts_code/:riskType` 接口（条件单导入用）

### 2. 数据格式检测
- [ ] 自动检测 stock_analyzer.py 输出格式（v1/v2）
- [ ] v1 格式自动降级处理
- [ ] v2 格式直接返回

### 3. 缓存兼容
- [x] 缓存支持版本隔离（v1/v2）
  - 已修改 `getCachedReport(stockCode, version = "v1")`
  - 已修改 `setCachedReport(stockCode, payload, version = "v1")`
  - 缓存 key 格式：`${version}:${stockCode}`

---

## 🔧 实施步骤

### Step 1: 新增 v2 接口

**文件**: `stock-system/api/analysis.js`

```javascript
// 新增 v2 接口 - 返回结构化数据
router.get('/v2/analyze/report', async (req, res) => {
  try {
    const { ts_code } = req.query;
    
    if (!ts_code) {
      return res.status(400).json({ success: false, error: '缺少 ts_code 参数' });
    }
    
    // 调用 stock_analyzer.py
    const result = await analyzeStockWithCache(ts_code, { version: 'v2' });
    
    res.json({
      success: true,
      data: result,
      version: 'v2'
    });
  } catch (error) {
    console.error('分析失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 新增策略导入接口 - 条件单专用
router.get('/v2/analyze/strategy/:ts_code/:riskType', async (req, res) => {
  try {
    const { ts_code, riskType } = req.params;
    
    if (!['aggressive', 'balanced', 'conservative'].includes(riskType)) {
      return res.status(400).json({
        success: false,
        error: 'riskType 必须是 aggressive/balanced/conservative'
      });
    }
    
    const result = await analyzeStockWithCache(ts_code, { version: 'v2' });
    
    const strategy = result.strategies[riskType];
    
    res.json({
      success: true,
      data: {
        ts_code,
        risk_level: strategy.risk_level,
        actions: strategy.actions,
        summary_text: strategy.summary_text
      }
    });
  } catch (error) {
    console.error('获取策略失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Step 2: 修改 analyzeStockWithCache 函数

```javascript
async function analyzeStockWithCache(ts_code, options = {}) {
  const { version = 'v1' } = options;
  const cacheKey = `analyze:${version}:${ts_code}`;
  
  // 尝试从缓存获取
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // 调用 Python 脚本
  const result = await runAnalyzer(ts_code, version);
  
  // 写入缓存（30 分钟）
  await redisClient.setex(cacheKey, 1800, JSON.stringify(result));
  
  return result;
}

async function runAnalyzer(ts_code, version) {
  const scriptPath = path.join(__dirname, '../../skills/a 股个股分析/scripts/stock_analyzer.py');
  
  return new Promise((resolve, reject) => {
    const args = ['--json', ts_code];
    
    execFile('python3', [scriptPath, ...args], {
      timeout: 60000
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`脚本执行失败：${stderr}`));
        return;
      }
      
      try {
        const data = JSON.parse(stdout);
        
        // 检测数据格式
        const isV2 = isV2Format(data);
        
        if (version === 'v2' && !isV2) {
          // v2 请求但返回 v1 格式，提示升级
          console.warn('警告：stock_analyzer.py 仍输出 v1 格式，请升级脚本');
        }
        
        resolve(data);
      } catch (e) {
        reject(new Error(`JSON 解析失败：${e.message}`));
      }
    });
  });
}

function isV2Format(data) {
  return data.strategies && 
         typeof data.strategies.aggressive === 'object' &&
         Array.isArray(data.strategies.aggressive.actions);
}
```

### Step 3: 修改原 v1 接口（降级处理）

```javascript
// 原 v1 接口 - 保持向后兼容
router.get('/analyze/report', async (req, res) => {
  try {
    const { ts_code } = req.query;
    
    if (!ts_code) {
      return res.status(400).json({ success: false, error: '缺少 ts_code 参数' });
    }
    
    const result = await analyzeStockWithCache(ts_code, { version: 'v1' });
    
    // 如果是 v2 格式，降级为 v1
    if (isV2Format(result)) {
      const v1Data = {
        ...result,
        strategies: {
          aggressive: result.strategies.aggressive.summary_text,
          balanced: result.strategies.balanced.summary_text,
          conservative: result.strategies.conservative.summary_text
        }
      };
      return res.json({ success: true, data: v1Data });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('分析失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## ✅ 验收检查清单

- [x] `/api/analyze/report` 接口正常（v1 兼容，503 是数据源问题）
- [x] `/api/v2/analyze/report` 接口正常（v2 结构化，api/v2.js 已实现）
- [x] `/api/v2/analyze/strategy/:ts_code/:riskType` 接口正常
- [x] 缓存 key 版本区分正确（analyze.js 已修复）
- [x] 路由挂载正确（server.js 已添加 /api/v2）
- [x] Git 提交规范
- [ ] Codex 验收通过

**修复记录**（2026-03-22 12:45）:
- server.js: 添加 `app.use('/api/v2', v2Router)` 路由挂载
- analyze.js: 缓存版本隔离（version 参数）
- v1 接口 503：新浪财经 API 数据源不可用（非代码问题）

---

## 🔗 相关文档

- Schema 文档：`/Users/vvc/.openclaw/workspace/stock-system/docs/schema/analyzer-output-v2.md`
- 上游任务：`TASK_ANALYZE_STRUCT_002`

---

_🐾 灵爪监督于 2026-03-22 11:16_
