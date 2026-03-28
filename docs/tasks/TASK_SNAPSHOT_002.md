# TASK_SNAPSHOT_002: 创建 policy_events 表

已基于真实数据库、迁移脚本、回填脚本证据确认完成；详细证据见 docs/runtime/TASK_SNAPSHOT_001-005_STATUS.md。

**任务 ID**: TASK_SNAPSHOT_002  
**任务名称**: 创建政策事件库表  
**优先级**: P0  
**创建时间**: 2026-03-24  
**预计工作量**: 0.5 天  
**状态**: 已完成（done）

---

## 📋 任务描述

创建 `policy_events` 表，用于存储政策事件，支持回测系统的历史政策评分查询。

---

## 🎯 验收标准

| 标准 | 目标值 | 验证方法 |
|------|--------|---------|
| 表结构完整 | 包含所有必需字段 | SQL 检查 |
| 索引创建 | publish_date + industry 索引 | SQL 检查 |
| 测试插入 | 可正常插入和查询 | 运行测试脚本 |
| 示例数据 | 已写入真实政策记录（当前 56 条） | 验证查询 |

---

## 📊 表结构设计

```sql
-- 政策事件库
CREATE TABLE IF NOT EXISTS policy_events (
    event_id TEXT PRIMARY KEY,           -- 事件 ID (POL_20260324_001)
    publish_date TEXT NOT NULL,          -- 政策发布日期 (YYYY-MM-DD)
    industry TEXT NOT NULL,              -- 影响行业 (白酒、AI 等)
    policy_type TEXT,                    -- 政策类型：规划/扶持/限制/规范
    title TEXT NOT NULL,                 -- 政策标题
    source TEXT,                         -- 来源：国务院/部委/地方政府
    impact_score REAL,                   -- 影响强度 (1-5)
    content TEXT,                        -- 政策摘要
    url TEXT,                            -- 原文链接
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_publish_date ON policy_events(publish_date);
CREATE INDEX IF NOT EXISTS idx_industry ON policy_events(industry);
CREATE INDEX IF NOT EXISTS idx_date_industry ON policy_events(publish_date, industry);
```

---

## 🔧 实现步骤

### 步骤 1: 创建 SQL 脚本

**文件**: `stock-system/db/migrations/002_create_policy_events_table.sql`

```sql
-- 政策事件库
-- 创建时间：2026-03-24
-- 用途：存储政策事件，支持回测系统的历史政策评分查询

-- 删除旧表（如有）
DROP TABLE IF EXISTS policy_events;

-- 创建表
CREATE TABLE policy_events (
    event_id TEXT PRIMARY KEY,
    publish_date TEXT NOT NULL,
    industry TEXT NOT NULL,
    policy_type TEXT,
    title TEXT NOT NULL,
    source TEXT,
    impact_score REAL CHECK(impact_score >= 1 AND impact_score <= 5),
    content TEXT,
    url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_publish_date ON policy_events(publish_date);
CREATE INDEX idx_industry ON policy_events(industry);
CREATE INDEX idx_date_industry ON policy_events(publish_date, industry);

-- 插入示例数据
INSERT INTO policy_events VALUES
('POL_20240101_001', '2024-01-01', 'AI', '扶持', '国家人工智能发展规划', '国务院', 5.0, '发布人工智能发展总体规划', 'http://gov.cn/xxx'),
('POL_20240115_001', '2024-01-15', '白酒', '规范', '白酒行业生产规范', '工信部', 3.0, '规范白酒生产标准', 'http://miit.gov.cn/xxx'),
('POL_20240201_001', '2024-02-01', '光伏', '扶持', '光伏产业补贴政策', '财政部', 4.5, '延续光伏补贴', 'http://mof.gov.cn/xxx'),
('POL_20240215_001', '2024-02-15', 'CPO', '扶持', '光通信产业发展规划', '工信部', 4.0, '支持光通信产业发展', 'http://miit.gov.cn/xxx'),
('POL_20240301_001', '2024-03-01', '医药', '规范', '创新药审批规范', '药监局', 3.5, '优化创新药审批流程', 'http://nmpa.gov.cn/xxx'),
('POL_20240315_001', '2024-03-15', '新能源', '扶持', '新能源汽车购置税减免', '财政部', 4.5, '延续新能源车购置税减免', 'http://mof.gov.cn/xxx'),
('POL_20240401_001', '2024-04-01', '金融', '规范', '资本市场改革方案', '证监会', 4.0, '深化资本市场改革', 'http://csrc.gov.cn/xxx'),
('POL_20240415_001', '2024-04-15', '地产', '限制', '房地产调控政策', '住建部', 3.0, '加强房地产调控', 'http://mohurd.gov.cn/xxx'),
('POL_20240501_001', '2024-05-01', '科技', '扶持', '芯片产业扶持政策', '工信部', 5.0, '支持芯片产业发展', 'http://miit.gov.cn/xxx'),
('POL_20240515_001', '2024-05-15', '消费', '扶持', '促进消费政策', '商务部', 3.5, '刺激消费市场', 'http://mofcom.gov.cn/xxx');
```

### 步骤 2: 执行迁移

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db < db/migrations/002_create_policy_events_table.sql
```

### 步骤 3: 验证表结构

```bash
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db <<EOF
-- 检查表是否存在
SELECT name FROM sqlite_master WHERE type='table' AND name='policy_events';

-- 检查表结构
PRAGMA table_info(policy_events);

-- 检查索引
SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='policy_events';

-- 检查示例数据
SELECT COUNT(*) FROM policy_events;

-- 测试查询（回测时点查询）
SELECT industry, impact_score, title
FROM policy_events
WHERE industry = 'AI' AND publish_date <= '2024-06-01'
ORDER BY publish_date DESC
LIMIT 10;
EOF
```

---

## 📝 交付清单

- [ ] 创建 SQL 迁移脚本 `db/migrations/002_create_policy_events_table.sql`
- [ ] 执行迁移，创建表
- [ ] 验证表结构（字段、索引）
- [ ] 写入真实政策记录（当前数据库中已有 56 条）
- [ ] 测试回测时点查询
- [ ] 生成交接文档

---

## 📚 关联文档

- 设计共识：`docs/DESIGN_CONSENSUS.md` 第 15.2 节
- 关联任务：TASK_SNAPSHOT_001 (stock_factor_snapshot 表), TASK_SNAPSHOT_003 (stock_selection_reports 表)

---

_创建时间：2026-03-24_
