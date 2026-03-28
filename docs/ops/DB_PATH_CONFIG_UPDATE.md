# 数据库路径统一配置

**日期**: 2026-03-25  
**问题**: stock_minute 数据回填到本地 workspace 数据库，但主数据库在 SSD 上  
**根因**: 多个文件使用了不同的数据库路径配置

---

## 📊 修复前状态

| 文件 | 配置 | 数据库路径 |
|------|------|-----------|
| `api/db.js` | 硬编码 | `/Volumes/SSD500/openclaw/stock-system/stock_system.db` ✅ |
| `scripts/fetch_minute_data.mjs` | `path.join` | `./stock_system.db` (本地) ❌ |
| `api/minute-fetch.js` | `path.join` | `./stock_system.db` (本地) ❌ |
| `.env` | 未设置 | - ❌ |

**结果**: 回填脚本写入本地数据库，API 读取 SSD 数据库，数据不一致

---

## ✅ 修复方案

### 1. 在 `.env` 中添加统一配置

```bash
# 数据库路径（SSD 主数据库）
DB_PATH=/Volumes/SSD500/openclaw/stock-system/stock_system.db
```

### 2. 修改所有脚本使用 `.env` 配置

**`scripts/fetch_minute_data.mjs`**:
```javascript
DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'stock_system.db')
```

**`api/minute-fetch.js`**:
```javascript
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'stock_system.db');
```

**`api/db.js`**:
```javascript
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const DB_PATH = process.env.DB_PATH || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
```

---

## 📋 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `stock-system/.env` | 新增 `DB_PATH` 配置 |
| `stock-system/scripts/fetch_minute_data.mjs` | 添加注释说明优先使用 .env |
| `stock-system/api/minute-fetch.js` | 改为使用 `process.env.DB_PATH` |
| `stock-system/api/db.js` | 添加 dotenv 加载，支持 .env 配置 |

---

## ✅ 验证结果

```bash
✅ .env DB_PATH: /Volumes/SSD500/openclaw/stock-system/stock_system.db
✅ api/db.js 加载成功
✅ stock_minute 记录数：116976
```

---

## 🎯 最佳实践

1. **所有数据库相关脚本**必须使用 `process.env.DB_PATH`
2. **`.env` 文件**是唯一的数据库路径配置源
3. **回退路径**：如果 `.env` 未设置，默认使用 SSD 主数据库路径
4. **禁止**在代码中硬编码数据库路径（除了回退路径）

---

## 📝 后续注意事项

- 新增脚本时，必须从 `.env` 读取 `DB_PATH`
- 定时任务脚本（HEARTBEAT.md 中配置的）会自动继承正确的数据库路径
- 如果迁移数据库，只需修改 `.env` 中的 `DB_PATH`

---

_创建时间：2026-03-25_
