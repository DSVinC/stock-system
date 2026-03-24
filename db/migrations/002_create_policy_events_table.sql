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
INSERT INTO policy_events (event_id, publish_date, industry, policy_type, title, source, impact_score, content, url) VALUES
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