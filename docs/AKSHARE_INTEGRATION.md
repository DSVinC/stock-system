# AkShare 公告数据集成方案

## ✅ 验证结果

**测试时间**: 2026-04-02  
**测试结果**: ✅ 成功获取公告数据

### 测试数据

| 股票 | 代码 | 公告数量 | 状态 |
|------|------|----------|------|
| 旭升集团 | 603305 | 10 条 | ✅ 成功 |
| 天赐材料 | 002709 | 10 条 | ✅ 成功 |
| 宁德时代 | 300750 | 10 条 | ✅ 成功 |

**总计**: 30 条公告

---

## 📦 安装要求

```bash
pip3 install akshare
```

**版本**: akshare 1.18.49  
**Python**: 3.9+

---

## 🔧 API 接口

### 函数名称
```python
ak.stock_news_em(symbol: str) -> pd.DataFrame
```

### 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | str | 是 | 股票代码（6 位数字） |

### 返回值

**类型**: `pandas.DataFrame`

**列名**:
| 列名 | 类型 | 说明 |
|------|------|------|
| 关键词 | str | 股票代码 |
| 新闻标题 | str | 公告标题 |
| 新闻内容 | str | 公告摘要 |
| 发布时间 | str | 发布时间（YYYY-MM-DD HH:MM:SS） |
| 文章来源 | str | 数据来源 |
| 新闻链接 | str | 原文链接 |

### 调用示例

```python
import akshare as ak

# 获取单只股票公告
df = ak.stock_news_em(symbol='603305')

# 获取前 10 条
top10 = df.head(10)

# 转换为字典
announcements = df.to_dict('records')
```

---

## 🎯 集成到 position-signals.js

### 方案 A: Python 脚本 + Node.js 调用

**步骤 1**: 创建 Python 封装脚本

```python
#!/usr/bin/env python3
# stock-system/scripts/fetch_announcements_akshare.py

import akshare as ak
import json
import sys

def fetch_announcements(symbol, limit=100):
    """
    获取公司公告
    """
    try:
        # 移除股票代码中的点号
        symbol_clean = symbol.replace('.', '').replace('sh', '').replace('sz', '')
        
        df = ak.stock_news_em(symbol=symbol_clean)
        
        # 转换为标准格式
        announcements = []
        for _, row in df.head(limit).iterrows():
            announcements.append({
                'ts_code': symbol,
                'title': row['新闻标题'],
                'content': row['新闻内容'],
                'ann_date': row['发布时间'].split(' ')[0].replace('-', ''),
                'pub_time': row['发布时间'],
                'source': row['文章来源'],
                'url': row['新闻链接'],
                'data_source': 'akshare'
            })
        
        return {'success': True, 'data': announcements}
    except Exception as e:
        return {'success': False, 'error': str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Missing symbol argument'}))
        sys.exit(1)
    
    symbol = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    
    result = fetch_announcements(symbol, limit)
    print(json.dumps(result, ensure_ascii=False))
```

**步骤 2**: 在 position-signals.js 中调用

```javascript
const { execSync } = require('child_process');

async function fetchAkshareAnnouncements(ts_code, limit = 100) {
  try {
    const symbol = ts_code.replace('.', '').replace('sh', '').replace('sz', '');
    const script = path.join(__dirname, 'fetch_announcements_akshare.py');
    
    const output = execSync(
      `python3 ${script} ${symbol} ${limit}`,
      { encoding: 'utf8', timeout: 30000 }
    );
    
    const result = JSON.parse(output);
    
    if (result.success) {
      return result.data;
    } else {
      console.warn('AkShare fetch failed:', result.error);
      return [];
    }
  } catch (error) {
    console.warn('AkShare execution failed:', error.message);
    return [];
  }
}
```

**步骤 3**: 修改 syncCompanyAnnouncements

```javascript
async function syncCompanyAnnouncements(db, holdings, options = {}) {
  const { now = new Date(), canUseSinaMcp = true } = options;
  
  let allAnnouncements = [];
  
  // 尝试 Sina MCP
  if (canUseSinaMcp) {
    try {
      const sinaEvents = await fetchSinaMajorEvents(sinaSymbol, 100);
      allAnnouncements.push(...sinaEvents);
    } catch (error) {
      console.warn('Sina MCP failed, fallback to AkShare');
    }
  }
  
  // 回退到 AkShare
  if (allAnnouncements.length === 0) {
    const akshareAnnouncements = await fetchAkshareAnnouncements(ts_code, 100);
    allAnnouncements.push(...akshareAnnouncements);
  }
  
  // 保存到数据库
  for (const ann of allAnnouncements) {
    await db.runPromise(
      `INSERT OR IGNORE INTO company_events 
       (ts_code, stock_name, event_type, event_time, title, content, source) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ann.ts_code, ann.stock_name, ann.event_type, ann.ann_date, 
       ann.title, ann.content, ann.data_source]
    );
  }
  
  return { synced: allAnnouncements.length, inserted: allAnnouncements.length };
}
```

---

## 📊 数据源对比

| 特性 | AkShare | Tushare | 新浪 MCP |
|------|---------|---------|----------|
| **费用** | 免费 | 积分制 | 收费 |
| **数据质量** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **更新频率** | 实时 | 实时 | 实时 |
| **实现难度** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **依赖** | Python + akshare | Python + tushare | MCP 服务 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 🧪 测试脚本

运行测试：
```bash
cd /Users/vvc/.openclaw/workspace/stock-system
python3 scripts/test-akshare-announcements.py
```

预期输出：
```
============================================================
AkShare 公告接口测试
============================================================

📋 测试获取 旭升集团 (603305) 公告...

✅ 获取成功，共 10 条公告

最新公告：
  1. 旭升集团正式易主：广州工控为控股股东，实控人变更为广州市政府
     日期：2026-04-01 17:58:00
     来源：财中社
     链接：http://finance.eastmoney.com/a/202604013692046...

📊 测试批量获取公告...

✅ 旭升集团：10 条公告
✅ 天赐材料：10 条公告
✅ 宁德时代：10 条公告

总计：30 条公告

✅ 所有测试完成！
```

---

## ⚠️ 注意事项

1. **Python 依赖**: 需要安装 akshare (`pip3 install akshare`)
2. **网络请求**: AkShare 从东方财富抓取数据，可能需要稳定的网络
3. **数据格式**: 发布时间格式为 `YYYY-MM-DD HH:MM:SS`
4. **错误处理**: 建议添加重试机制和超时处理
5. **列名**: 使用中文列名（新闻标题、发布时间等）

---

## 📝 相关文件

- **测试脚本**: `stock-system/scripts/test-akshare-announcements.py`
- **集成文档**: `stock-system/docs/AKSHARE_INTEGRATION.md`
- **位置信号模块**: `stock-system/api/position-signals.js`

---

**创建时间**: 2026-04-02  
**状态**: ✅ 已验证，⏳ 待集成
