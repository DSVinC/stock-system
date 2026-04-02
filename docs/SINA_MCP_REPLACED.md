# 新浪财经 MCP 完全替换为 AkShare（历史方案，已废弃）

## ⚠️ 文档状态

**记录时间**: 2026-04-02  
**当前状态**: ❌ 不再采用（仅保留归档记录）

---

## 当前生效方案（请以此为准）

- 主数据源：AkShare
- 备用数据源：新浪财经 MCP（自动回退）
- 口径文档：`docs/AKSHARE_PRIMARY_SINA_BACKUP.md`

---

## 📦 修改内容

### 1. position-signals.js

**修改文件**: `stock-system/api/position-signals.js`

**主要改动**:
1. 移除 Sina MCP 调用工具路径常量
2. 删除 `fetchSinaMajorEvents()` 函数
3. 删除 `parseSinaMajorEventsPayload()` 函数
4. 删除 `isSinaMcpToolAvailable()` 函数
5. 修改 `syncCompanyAnnouncements()` 默认使用 AkShare
6. 更新导出，移除 `parseSinaMajorEventsPayload`

**代码对比**:

**修改前**:
```javascript
const SINA_MCP_CALL_TOOL = '/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/scripts/call-tool.cjs';

// 优先使用 Sina MCP
if (canUseSinaMcp) {
  rows = await fetchSinaMajorEvents(sinaSymbol, 100);
}

// 回退到 AkShare
if (rows.length === 0) {
  rows = await fetchAkshareAnnouncements(tsCode, 100);
}
```

**修改后**:
```javascript
const AKSHARE_SCRIPT = '/Users/vvc/.openclaw/workspace/stock-system/scripts/fetch_announcements_akshare.py';
// SINA_MCP_CALL_TOOL 已废弃 - 完全使用 AkShare 免费数据源

// 直接使用 AkShare（免费数据源）
try {
  const akEvents = await fetchAkshareAnnouncements(tsCode, 100);
  rows = (akEvents || []).map(...);
} catch (error) {
  console.warn(`[position-signals] AkShare 公告同步失败 ${tsCode}: ${error.message}`);
}
```

---

## 🧪 测试结果

### 完整流程测试

**测试命令**:
```javascript
const result = await positionSignals._internal.syncCompanyAnnouncements(db, holdings);
```

**测试数据**:
- 旭升集团 (603305.SH)
- 天赐材料 (002709.SZ)

**测试结果**:
```
✅ 同步完成！
   获取：15 条
   插入：15 条

最新公告：
  1. 旭升集团正式易主：广州工控为控股股东
  2. 今日 56 只个股跨越牛熊分界线
  3. 【盘中播报】94 只个股突破年线
  4. 旭升集团：目前公司已与多家海内外客户建立合作关系
  5. 6 只个股 3 月 5 日大宗交易超 5000 万元
```

---

## 📊 数据源对比

| 特性 | AkShare（新） | Sina MCP（旧） |
|------|--------------|---------------|
| **费用** | ✅ 完全免费 | 💰 收费 |
| **数据质量** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **更新频率** | 实时 | 实时 |
| **实现难度** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **依赖** | Python + akshare | MCP 服务 |
| **状态** | ✅ 已启用 | ❌ 已废弃 |

---

## 🗑️ 废弃内容

以下代码已删除，不再使用：

1. **常量**: `SINA_MCP_CALL_TOOL`
2. **函数**: 
   - `fetchSinaMajorEvents()`
   - `parseSinaMajorEventsPayload()`
   - `isSinaMcpToolAvailable()`
3. **导出**: `parseSinaMajorEventsPayload`

---

## 📝 相关文件

### 已修改
- `stock-system/api/position-signals.js` - 完全使用 AkShare

### 已创建
- `stock-system/scripts/fetch_announcements_akshare.py` - Python 封装
- `stock-system/docs/AKSHARE_INTEGRATION_COMPLETE.md` - 集成文档
- `stock-system/docs/SINA_MCP_REPLACED.md` - 本文档

### 保留（备用）
- `skills/sina-ashare-mcp/` - 保留但不再调用
- `stock-system/lib/sina-free-api.js` - 保留作为技术储备

---

## 🎯 影响范围

### 直接影响的模块

1. **持仓监控** (`scripts/monitor-positions.ts/mjs`)
   - 调用 `syncCompanyAnnouncements()` 获取公告
   - 现在自动使用 AkShare

2. **公告信号生成** (`api/position-signals.js`)
   - 完全依赖 AkShare 数据
   - 不再调用 Sina MCP

### 不受影响的模块

1. **实时行情** - 使用 `sina-free-api.js`（已经是免费 API）
2. **历史数据** - 使用 Tushare（已有独立实现）

---

## ⚠️ 注意事项

1. **Python 依赖**: 必须安装 akshare (`pip3 install akshare`)
2. **网络请求**: AkShare 从东方财富抓取数据，需要稳定网络
3. **错误处理**: 已添加超时（30 秒）和错误处理
4. **回退方案**: 如需回退 Sina MCP，需要恢复已删除的代码

---

## 🔄 如需恢复 Sina MCP

如果未来需要恢复 Sina MCP，需要：

1. 恢复 `SINA_MCP_CALL_TOOL` 常量
2. 恢复 `fetchSinaMajorEvents()` 函数
3. 恢复 `parseSinaMajorEventsPayload()` 函数
4. 修改 `syncCompanyAnnouncements()` 逻辑
5. 恢复导出

**建议**: 保留当前代码，如需 Sina MCP 创建新分支。

---

## 📈 成本节省

**之前**: Sina MCP 收费服务  
**现在**: AkShare 完全免费

**预计年节省**: 取决于调用频率，估计数百至数千元

---

**创建时间**: 2026-04-02  
**状态**: ✅ 已完成
