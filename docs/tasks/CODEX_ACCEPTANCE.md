# Codex 验收任务 - v2 结构化改造

**验收负责人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 11:20  

---

## 📋 验收任务列表

### 验收 1: TASK_ANALYZE_STRUCT_002 (stock_analyzer.py)

**触发条件**: TASK_002 标记为完成  
**验收脚本位置**: `stock-system/test/analyze-struct-v2.test.js`

**验收清单**:
- [ ] v1 备份文件存在 (`stock_analyzer.py.v1`)
- [ ] strategies 输出为对象结构（非纯文本）
- [ ] strategies.aggressive.actions 是数组
- [ ] 每个 action 包含 sequence, action_type, trigger_conditions
- [ ] summary_text 字段存在
- [ ] JSON 输出有效（可通过 json.tool 验证）
- [ ] 测试股票：300750.SZ（宁德时代）
- [ ] Git 提交规范正确

**验收命令**:
```bash
# 1. 验证 JSON 输出
python3 /Users/vvc/.openclaw/workspace/skills/a 股个股分析/scripts/stock_analyzer.py --json 300750.SZ | python3 -m json.tool > /tmp/test_output.json

# 2. 验证 schema 合规性
node /Users/vvc/.openclaw/workspace/stock-system/test/validate-schema-v2.js /tmp/test_output.json

# 3. 验证 Git 提交
cd /Users/vvc/.openclaw/workspace/stock-system
git log -1 --oneline
```

**验收标准**: 全部检查项通过 ✅

---

### 验收 2: TASK_ANALYZE_STRUCT_003 (analysis.js)

**触发条件**: TASK_003 标记为完成

**验收清单**:
- [ ] `/api/analyze/report` 接口正常（v1 兼容）
- [ ] `/api/v2/analyze/report` 接口正常（v2 结构化）
- [ ] `/api/v2/analyze/strategy/:ts_code/:riskType` 接口正常
- [ ] 缓存 key 版本区分正确
- [ ] v1/v2 格式检测逻辑正确
- [ ] 降级处理逻辑正确
- [ ] Git 提交规范正确

**验收命令**:
```bash
# 1. 测试 v1 接口
curl "http://localhost:3000/api/analyze/report?ts_code=300750.SZ" | jq '.data.strategies.aggressive'

# 2. 测试 v2 接口
curl "http://localhost:3000/api/v2/analyze/report?ts_code=300750.SZ" | jq '.data.strategies.aggressive.actions'

# 3. 测试策略导入接口
curl "http://localhost:3000/api/v2/analyze/strategy/300750.SZ/balanced" | jq '.data.actions'
```

**验收标准**: 全部接口返回正确数据结构 ✅

---

### 验收 3: TASK_ANALYZE_STRUCT_004 (select.html)

**触发条件**: TASK_004 标记为完成

**验收清单**:
- [ ] 方向股列表正确显示评分
- [ ] 显示操作建议摘要（summary_text）
- [ ] 显示关键价格（买入价、止损价、仓位）
- [ ] "查看报告"按钮正常跳转
- [ ] "导入条件单"按钮存在
- [ ] 样式符合暗色主题规范
- [ ] Git 提交规范正确

**验收命令**:
```bash
# 1. 浏览器测试（手动或自动化）
open http://localhost:3000/select.html

# 2. 检查页面元素
# - 方向股卡片存在
# - 评分显示正确
# - 操作建议显示正确
```

**验收标准**: 界面显示正确，交互正常 ✅

---

### 验收 4: 集成验收

**触发条件**: TASK_002 + TASK_003 + TASK_004 全部完成

**验收清单**:
- [ ] 完整流程测试：select.html → 查看报告 → 导入条件单
- [ ] 数据一致性：方向股列表与报告数据一致
- [ ] 性能测试：API 响应时间 < 500ms
- [ ] 错误处理：异常情况下有友好提示

**验收命令**:
```bash
# 1. 完整流程测试脚本
node /Users/vvc/.openclaw/workspace/stock-system/test/integration-v2.test.js

# 2. 性能测试
ab -n 100 -c 10 http://localhost:3000/api/v2/analyze/report?ts_code=300750.SZ
```

**验收标准**: 完整流程畅通，性能达标 ✅

---

## 📝 验收报告模板

```markdown
# 验收报告 - TASK_XXX

**验收时间**: YYYY-MM-DD HH:MM
**验收人**: Codex
**任务**: TASK_XXX

## 验收结果

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 检查项 1 | ✅/❌ | ... |
| 检查项 2 | ✅/❌ | ... |

## 问题与修复建议

...

## 最终结论

✅ 通过 / ❌ 不通过

## 签字

Codex @ YYYY-MM-DD HH:MM
```

---

_🐾 灵爪创建于 2026-03-22 11:20_
