# 公司公告数据源方案对比

## 📊 方案对比

| 数据源 | 免费程度 | 实现难度 | 数据质量 | 推荐度 | 状态 |
|--------|----------|----------|----------|--------|------|
| **Tushare Pro (anns_d)** | ⚠️ 需积分 | ✅ 已有测试代码 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **推荐** |
| 新浪财经 HTTP API | ✅ 完全免费 | ❌ HTML 解析复杂 | ⭐⭐⭐ | ⭐⭐ | 待验证 |
| 新浪财经 MCP | 💰 收费 | ✅ 已有实现 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 当前使用 |

---

## ✅ 推荐方案：Tushare Pro `anns_d` 接口

### 接口信息

**接口名称**: `anns_d`（上市公司全量公告）

**权限要求**: 需要 Tushare Pro 积分（具体积分要求参考官方文档）

**接口特点**:
- 数据范围：全量公告数据
- 返回字段：公告日期、股票代码、股票名称、标题、URL、发布时间
- 单次限量：最大 2000 条
- 支持筛选：按股票代码、公告日期范围筛选
- PDF 下载：✅ 提供原文下载链接

### 调用示例

```python
import tushare as ts

# 初始化
pro = ts.pro_api('YOUR_TUSHARE_TOKEN')

# 按股票代码查询
df = pro.anns_d(
    ts_code='600519.SH',
    start_date='20260301',
    end_date='20260401'
)

# 按日期范围查询全量公告
df = pro.anns_d(
    start_date='20260401',
    end_date='20260401'
)
```

### 代码中已有实现

**测试文件**: `stock-system/test/position-signals-announcement-fallback.test.js`

**测试函数**: `fetchTushareAnnouncements()`

**数据源标记**: `tushare_anns_d`

**测试代码示例**:
```javascript
const result = await _internal.syncCompanyAnnouncements(db, holdings, {
  now: new Date('2026-03-29T12:00:00+08:00'),
  canUseSinaMcp: false,
  fetchTushareAnnouncements: async () => ([
    {
      ts_code: '601012.SH',
      name: '隆基绿能',
      ann_date: '20260328',
      title: '关于股份回购进展的公告',
      content: '',
      source: 'tushare_anns_d'
    }
  ])
});
```

### 恢复步骤

1. **确认 Tushare Token 权限**
   ```bash
   # 检查是否有 anns_d 接口权限
   curl -X POST "http://api.tushare.pro" \
     -H "Content-Type: application/json" \
     -d '{"api_name": "anns_d", "token": "YOUR_TOKEN"}'
   ```

2. **恢复 position-signals.js 中的回退代码**
   - 取消注释 `fetchTushareAnnouncements()` 函数
   - 修改 `syncCompanyAnnouncements()` 使用 Tushare 作为回退

3. **运行测试验证**
   ```bash
   cd /Users/vvc/.openclaw/workspace/stock-system
   node test/position-signals-announcement-fallback.test.js
   ```

---

## ⚠️ 备选方案：新浪财经免费 HTTP API

### 已实现功能

已在 `stock-system/lib/sina-free-api.js` 中添加：
- `getAnnouncements(symbol, page, limit)` - 获取公告列表
- `getAnnouncementDetail(url)` - 获取公告详情
- `getAnnouncementsBatch(symbols, limit)` - 批量获取
- `classifyAnnouncementType(title)` - 风险分类

### 当前问题

**HTML 解析问题**: 新浪财经公告页面使用动态加载或复杂的 HTML 结构，当前解析逻辑无法正确提取公告列表。

**测试状态**:
```
📋 测试单只股票公告获取...
✅ 获取成功，共 0 条公告  ← 解析失败
```

### 可能的解决方案

1. **使用不同的 URL 格式**
   - 当前：`/corp/go.php/vCB_AllBulletin/stockid/{symbol}.phtml`
   - 尝试：`/corp/view/vCB_AllBulletinDetail.php?stockid={symbol}`

2. **调整 HTML 解析正则**
   - 需要查看实际的 HTML 结构
   - 可能需要处理 JavaScript 动态加载

3. **考虑使用其他免费 API**
   - 东方财富 Choice（需要爬虫）
   - 同花顺 iFinD（需要爬虫）

---

## 🎯 推荐实施路径

### 短期（本周）
1. ✅ 确认 Tushare Token 是否有 `anns_d` 权限
2. ✅ 恢复 `position-signals.js` 中的 Tushare 回退代码
3. ✅ 运行测试验证功能正常

### 中期（本月）
1. ⏳ 验证新浪财经 HTML 解析问题
2. ⏳ 如 Tushare 权限不足，考虑其他免费数据源
3. ⏳ 完善新浪免费 API 实现

### 长期
1. 🔄 保持新浪财经 MCP 作为主要数据源（数据质量最好）
2. 🔄 Tushare 作为免费回退方案
3. 🔄 新浪免费 HTTP API 作为备选

---

## 📝 相关文件

- **Tushare 回退测试**: `stock-system/test/position-signals-announcement-fallback.test.js`
- **新浪免费 API 实现**: `stock-system/lib/sina-free-api.js`
- **新浪 API 测试脚本**: `stock-system/scripts/test-sina-announcements.js`
- **新浪 API 文档**: `stock-system/docs/SINA_FREE_ANNOUNCEMENTS.md`

---

**最后更新**: 2026-04-02  
**状态**: ✅ Tushare 方案已就绪，⏳ 新浪 API 待验证
