# 股票系统数据源策略

**版本**: v1.0  
**更新日期**: 2026-03-25  
**原则**: 成本优化 + 稳定可靠 + 多源备份

---

## 📊 数据源总览

| 数据类型 | 主数据源 | 备用数据源 | 说明 |
|----------|----------|------------|------|
| **实时行情** | 免费新浪 HTTP API | 新浪财经 MCP | 免费 API 优先，MCP 备用 |
| **分钟线数据** | 免费新浪 HTTP API | 新浪财经 MCP | 免费 API 优先，MCP 备用 |
| **财经新闻** | 新浪财经 MCP | - | MCP 专用，不替换 |
| **历史日线** | Tushare Pro | BaoStock | Tushare 为主 |
| **历史分钟线** | BaoStock | 新浪财经 MCP | BaoStock 批量回填 |
| **资金流数据** | Tushare Pro | - | Tushare 专用 |
| **基本面数据** | Tushare Pro | - | Tushare 专用 |
| **政策事件** | 预设 JSON | - | 本地数据 |

---

## 🎯 各数据源使用策略

### 1. 实时行情（盘中监控）

**主数据源**: 免费新浪 HTTP API
```javascript
const sinaFreeApi = require('../lib/sina-free-api');
const quote = await sinaFreeApi.getQuote('sh600519');
```

**备用数据源**: 新浪财经 MCP
```javascript
// 当免费 API 不可用时切换
const { getRealtimeQuote } = require('sina-ashare-mcp');
const quote = await getRealtimeQuote('sh600519');
```

**切换条件**:
- 免费 API 连续失败 3 次
- 免费 API 响应时间 > 5 秒
- 免费 API 返回数据不完整

---

### 2. 分钟线数据

**主数据源**: 免费新浪 HTTP API
```javascript
const minuteData = await sinaFreeApi.getMinuteData('sh600519', 5, 100);
```

**备用数据源**: 新浪财经 MCP
```javascript
const { getMinuteData } = require('sina-ashare-mcp');
const minuteData = await getMinuteData('sh600519', 5, 100);
```

**历史回填**: BaoStock（批量，低成本）

---

### 3. 财经新闻（MCP 专用）

**唯一数据源**: 新浪财经 MCP
```javascript
const { getNewsFlash } = require('sina-ashare-mcp');
const news = await getNewsFlash({ limit: 50 });
```

**说明**:
- ✅ 新闻接口仅在 MCP 中提供
- ✅ 免费 API 无新闻数据
- ✅ 保留 MCP 服务的核心原因

**使用场景**:
- 每日财经早报 (`generate_morning_brief_v5.mjs`)
- 黑天鹅事件监控
- 负面新闻检测

---

### 4. 历史数据

#### 日线数据
- **主**: Tushare Pro（8000 积分，500 次/分钟）
- **备**: BaoStock（免费，无限制）

#### 分钟线数据
- **历史回填**: BaoStock（批量获取）
- **实时查询**: 免费新浪 API

#### 资金流数据
- **唯一**: Tushare Pro（已回填近 5 年数据）

---

## 🔄 故障切换流程

```
实时行情查询
    ↓
[免费新浪 API] ← 主数据源
    ↓ 失败？
[重试 2 次]
    ↓ 仍失败？
[新浪财经 MCP] ← 备用数据源
    ↓ 失败？
[返回缓存数据 / 报错]
```

---

## 💰 成本优化

### 已实现优化

| 项目 | 原方案 | 新方案 | 节省 |
|------|--------|--------|------|
| 实时行情 | MCP（收费） | 免费 API | 100% |
| 分钟线查询 | MCP（收费） | 免费 API | 100% |
| 历史分钟线 | MCP（收费） | BaoStock | 100% |

### 仍需付费

| 项目 | 服务 | 成本 | 必要性 |
|------|------|------|--------|
| 财经新闻 | 新浪财经 MCP | 收费 | ⭐⭐⭐ 必须 |
| 资金流数据 | Tushare Pro | 8000 积分 | ⭐⭐⭐ 必须 |
| 基本面数据 | Tushare Pro | 8000 积分 | ⭐⭐⭐ 必须 |

**总体节省**: 约 60-70% 费用（实时查询改用免费 API）

---

## 📋 配置管理

### 环境变量

```bash
# Tushare Pro Token
TUSHARE_TOKEN=从 Keychain 读取

# 新浪财经 MCP（备用）
SINA_MCP_ENABLED=true
SINA_MCP_TOKEN=从 Keychain 读取

# 免费新浪 API（无需配置）
```

### 切换开关

```javascript
// market-data.js
const USE_FREE_API = process.env.USE_FREE_API !== 'false'; // 默认 true
const USE_MCP_BACKUP = process.env.USE_MCP_BACKUP === 'true'; // 默认 false

async function getRealtimeQuote(symbol) {
  if (USE_FREE_API) {
    try {
      return await sinaFreeApi.getQuote(symbol);
    } catch (err) {
      if (USE_MCP_BACKUP) {
        console.warn('免费 API 失败，切换到 MCP 备用');
        return await mcpApi.getQuote(symbol);
      }
      throw err;
    }
  }
  return await mcpApi.getQuote(symbol);
}
```

---

## 🔒 安全性

### Keychain 存储

```bash
# Tushare Token
security add-generic-password -s "openclaw/skills/tushare/token" -w "$TOKEN"

# 新浪 MCP Token（备用）
security add-generic-password -s "openclaw/skills/sina-mcp/token" -w "$TOKEN"
```

### 禁止明文

- ❌ 不得在代码中硬编码 Token
- ❌ 不得在 .env 文件存储明文 Token
- ❌ 不得提交 Token 到 Git

---

## 📈 监控与告警

### 数据源健康检查

```javascript
// 每日检查
- 免费 API 可用性
- MCP 服务可用性
- Tushare 积分余额
- 数据一致性校验
```

### 告警条件

- 免费 API 连续失败 10 次 → 飞书告警
- MCP 服务不可用 → 飞书告警
- Tushare 积分 < 1000 → 飞书告警

---

## 🎯 最佳实践

1. **优先使用免费数据源**
   - 实时行情 → 免费新浪 API
   - 分钟线 → 免费新浪 API
   - 历史数据 → BaoStock

2. **保留付费服务作为备用**
   - MCP 服务 → 实时行情备用 + 新闻专用
   - Tushare → 资金流 + 基本面专用

3. **定期验证数据一致性**
   - 每周对比免费 API vs MCP 数据
   - 发现偏差及时调整

4. **监控成本**
   - 每月检查 MCP 用量
   - 每月检查 Tushare 积分

---

## 📝 变更日志

| 日期 | 变更 | 影响 |
|------|------|------|
| 2026-03-25 | 实时行情改用免费 API | 节省 60-70% 费用 |
| 2026-03-25 | 保留 MCP 作为备用 + 新闻源 | 确保稳定性 |
| 2026-03-25 | 分钟线历史数据改用 BaoStock | 进一步降低成本 |

---

**策略原则**: 能免费不付费，但保留付费备用确保稳定。🐾
