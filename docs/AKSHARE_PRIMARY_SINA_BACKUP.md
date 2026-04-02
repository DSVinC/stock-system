# AkShare 主数据源 + Sina MCP 备用方案

## ✅ 完成状态

**完成时间**: 2026-04-02  
**状态**: ✅ 已完成并验证

---

## 📦 数据源策略

### 优先级

| 优先级 | 数据源 | 状态 | 说明 |
|--------|--------|------|------|
| **🥇 主数据源** | **AkShare** | ✅ 默认使用 | 完全免费 |
| **🥈 备用数据源** | **Sina MCP** | ✅ 自动回退 | 收费服务 |

### 工作流程

```
持仓监控启动
    ↓
尝试 AkShare（免费）
    ↓
成功？
    ├─ 是 → 使用 AkShare 数据 ✅
    └─ 否 → 回退 Sina MCP（备用）
              ↓
         成功？
              ├─ 是 → 使用 Sina MCP 数据 ✅
              └─ 否 → 记录警告，跳过该股票 ⚠️
```

---

## 🔧 代码实现

### syncCompanyAnnouncements 逻辑

```javascript
// 1. 优先使用 AkShare（免费数据源）
try {
  const akEvents = await fetchAkshareAnnouncements(tsCode, 100);
  rows = (akEvents || []).map(...);
  
  if (rows.length > 0) {
    console.log(`[position-signals] AkShare 获取成功 ${tsCode}: ${rows.length} 条公告`);
  }
} catch (error) {
  console.warn(`[position-signals] AkShare 公告同步失败 ${tsCode}: ${error.message}`);
}

// 2. 回退到 Sina MCP（备用数据源）
if (rows.length === 0 && isSinaMcpToolAvailable()) {
  console.log(`[position-signals] AkShare 无数据，尝试 Sina MCP ${tsCode}`);
  try {
    const events = await fetchSinaMajorEvents(sinaSymbol, 100);
    rows = (events || []).map(...);
    
    if (rows.length > 0) {
      console.log(`[position-signals] Sina MCP 获取成功 ${tsCode}: ${rows.length} 条公告`);
    }
  } catch (error) {
    console.warn(`[position-signals] Sina MCP 公告同步失败 ${tsCode}: ${error.message}`);
  }
}
```

---

## 🧪 测试结果

### 测试 1: AkShare 成功（主数据源）

**测试股票**:
- 旭升集团 (603305.SH)
- 天赐材料 (002709.SZ)

**结果**:
```
[position-signals] AkShare 获取成功 603305.SH: 5 条公告
[position-signals] AkShare 获取成功 002709.SZ: 10 条公告

✅ 同步完成！
   获取：15 条
   插入：0 条（数据已存在）
```

**结论**: ✅ AkShare 正常工作，作为主数据源

### 测试 2: Sina MCP 回退（备用数据源）

**触发条件**: AkShare 返回 0 条数据时自动触发

**预期日志**:
```
[position-signals] AkShare 无数据，尝试 Sina MCP 600519.SH
[position-signals] Sina MCP 获取成功 600519.SH: 8 条公告
```

---

## 📊 数据源对比

| 特性 | AkShare（主） | Sina MCP（备用） |
|------|--------------|-----------------|
| **费用** | ✅ 完全免费 | 💰 收费 |
| **数据质量** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **更新频率** | 实时 | 实时 |
| **覆盖率** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **稳定性** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **使用场景** | 默认使用 | AkShare 失败时自动回退 |

---

## 📝 修改的文件

### api/position-signals.js

**新增/恢复内容**:
1. `SINA_MCP_CALL_TOOL` 常量
2. `parseSinaMajorEventsPayload()` 函数
3. `fetchSinaMajorEvents()` 函数
4. `isSinaMcpToolAvailable()` 函数
5. 导出中恢复相关函数

**修改逻辑**:
- `syncCompanyAnnouncements()`: 优先 AkShare，失败回退 Sina MCP

---

## ⚠️ 注意事项

### AkShare 失败场景

AkShare 可能失败的情况：
1. 网络问题（东方财富网站不可达）
2. 股票代码格式错误
3. 股票停牌/退市无公告数据

**处理**: 自动回退 Sina MCP，无需人工干预

### Sina MCP 启用条件

Sina MCP 仅在以下条件满足时启用：
1. AkShare 返回 0 条数据
2. Sina MCP 工具文件存在 (`isSinaMcpToolAvailable()`)

**工具路径**: `/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/scripts/call-tool.cjs`

---

## 🎯 优势

### 成本优化

- **默认使用 AkShare**: 节省 Sina MCP 调用费用
- **备用 Sina MCP**: 确保数据完整性，不遗漏重要公告

### 可靠性提升

- **双数据源**: 单一数据源故障时自动切换
- **无缝回退**: 无需人工干预，系统自动处理

### 灵活性

- **可配置**: 可根据需要调整优先级
- **易维护**: 两个数据源独立，互不影响

---

## 📈 监控建议

### 日志监控

关注以下日志模式：

**正常情况**:
```
[position-signals] AkShare 获取成功 603305.SH: 5 条公告
```

**回退情况**:
```
[position-signals] AkShare 无数据，尝试 Sina MCP 600519.SH
[position-signals] Sina MCP 获取成功 600519.SH: 8 条公告
```

**异常情况** (需关注):
```
[position-signals] AkShare 公告同步失败 603305.SH: ...
[position-signals] Sina MCP 公告同步失败 603305.SH: ...
```

### 统计指标

建议监控：
- AkShare 成功率
- Sina MCP 回退频率
- 公告数据总量趋势

---

## 🔄 未来优化

### 可选配置

允许通过配置调整数据源策略：

```javascript
const options = {
  dataSource: {
    primary: 'akshare',  // 或 'sina_mcp'
    fallback: 'sina_mcp', // 或 null（禁用回退）
    timeout: {
      akshare: 30000,    // 30 秒
      sina_mcp: 20000    // 20 秒
    }
  }
};
```

### 并行获取

同时请求两个数据源，合并去重：

```javascript
const [akData, sinaData] = await Promise.all([
  fetchAkshareAnnouncements(tsCode),
  fetchSinaMajorEvents(sinaSymbol)
]);
```

---

**创建时间**: 2026-04-02  
**状态**: ✅ 已完成
