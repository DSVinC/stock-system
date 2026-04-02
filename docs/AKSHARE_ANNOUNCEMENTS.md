# AkShare 免费公告数据源

## 📦 简介

AkShare 是一个开源的 Python 财经数据接口库，提供丰富的 A 股数据，包括公司公告。

**GitHub**: https://github.com/akfamily/akshare  
**文档**: https://akshare.akfamily.xyz

## ✅ 优势

| 特点 | 说明 |
|------|------|
| **完全免费** | 无需积分、无需 Token |
| **数据丰富** | 股票、基金、期货、外汇等 |
| **更新活跃** | 社区维护，持续更新 |
| **易于使用** | 统一的 API 接口 |

## 📋 公告相关接口

### 1. 个股公告

```python
import akshare as ak

# 获取个股公告
stock_news_em_df = ak.stock_news_em(symbol="603305")
print(stock_news_em_df)

# 输出字段：
# - 公告日期
# - 公告标题
# - 公告链接
# - 公告内容
```

### 2. 财经新闻

```python
# 获取财经新闻
stock_news_main_sina_df = ak.stock_news_main_sina()
```

## 🔧 集成方案

### 方案 A: Python 脚本调用

在 `stock-system/scripts/` 中创建新的公告获取脚本：

```python
#!/usr/bin/env python3
"""
使用 AkShare 获取公司公告
"""
import akshare as ak
import sqlite3
from datetime import datetime

def fetch_akshare_announcements(ts_code, limit=100):
    """
    获取个股公告
    """
    try:
        # 转换股票代码格式
        symbol = ts_code.replace('.', '')
        
        # 获取公告数据
        df = ak.stock_news_em(symbol=symbol)
        
        # 转换为标准格式
        announcements = []
        for _, row in df.head(limit).iterrows():
            announcements.append({
                'ts_code': ts_code,
                'title': row['标题'],
                'ann_date': row['日期'],
                'url': row['链接'],
                'content': row.get('内容', ''),
                'source': 'akshare'
            })
        
        return announcements
    except Exception as e:
        print(f"Error fetching announcements for {ts_code}: {e}")
        return []

if __name__ == "__main__":
    # 测试
    announcements = fetch_akshare_announcements("603305.SH")
    print(f"获取到 {len(announcements)} 条公告")
    for ann in announcements[:5]:
        print(f"  - {ann['ann_date']}: {ann['title']}")
```

### 方案 B: Node.js 调用 Python 脚本

在 `sina-free-api.js` 旁边创建 `akshare-announcements.py`，通过 Node.js 调用：

```javascript
const { execSync } = require('child_process');

async function getAnnouncementsFromAkshare(symbol) {
  const script = `
import akshare as ak
df = ak.stock_news_em(symbol="${symbol}")
print(df.to_json(orient='records'))
  `;
  
  const result = execSync(`python3 -c "${script}"`, {
    encoding: 'utf8'
  });
  
  return JSON.parse(result);
}
```

## 📊 与其他数据源对比

| 数据源 | 免费程度 | 数据质量 | 实现难度 | 推荐度 |
|--------|----------|----------|----------|--------|
| **AkShare** | ✅ 完全免费 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Tushare anns_d | ⚠️ 需积分 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 新浪财经 MCP | 💰 收费 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 新浪 HTTP API | ✅ 完全免费 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |

## 🧪 测试步骤

1. **安装 akshare**
   ```bash
   pip3 install akshare
   ```

2. **测试接口**
   ```bash
   cd /Users/vvc/.openclaw/workspace/stock-system
   python3 scripts/test-akshare-announcements.py
   ```

3. **集成到 position-signals.js**
   - 修改 `syncCompanyAnnouncements()` 函数
   - 添加 AkShare 作为数据源选项

## 📝 注意事项

1. **依赖管理**: 需要安装 Python 和 akshare
2. **网络请求**: AkShare 从东方财富等网站抓取数据，可能需要代理
3. **数据格式**: 需要转换为系统标准格式
4. **错误处理**: 添加重试机制和超时处理

---

**创建时间**: 2026-04-02  
**状态**: ⏳ 待安装验证
