# TASK_E2E_FIX_002 交接文档

**任务 ID**: TASK_E2E_FIX_002  
**任务名称**: backtest.html 添加#maxPosition 控件  
**开发人员**: 灵爪  
**完成日期**: 2026-03-26  
**状态**: ✅ 已完成，已验收

---

## 📋 任务概述

**问题**: E2E 验收发现 backtest.html 页面缺少 `#maxPosition` 输入控件，但 API 合同和前端逻辑都引用该字段

**影响**: 网格交易策略无法配置最大持仓数，导致回测参数不完整

---

## 📁 交付物

### 修改文件

| 文件 | 变更说明 |
|------|----------|
| `backtest.html` | 在网格交易参数区域添加 `#maxPosition` 输入框 (line 1523) |

---

## 🔧 技术方案

### UI 位置
```html
<!-- 网格交易参数区域 -->
<div class="param-group">
  <label>最大持仓数</label>
  <div class="input-with-unit">
    <input type="number" id="maxPosition" class="form-input" value="5" min="1" max="20">
    <span class="unit">只</span>
  </div>
</div>
```

### 默认值
- **默认**: 5 只
- **范围**: 1-20 只
- **用途**: 限制网格交易策略的最大持仓股票数量

---

## ✅ 验收结果

| 标准 | 状态 | 验证方法 |
|------|------|----------|
| 页面存在#maxPosition 输入框 | ✅ | `document.getElementById('maxPosition')` 返回非空 |
| 默认值合理 | ✅ | 默认值 = 5 |
| 回测请求包含 gridConfig.maxPosition | ✅ | 前端请求体包含该字段 |

---

## 🧪 测试命令

```bash
# 验证 HTML 元素存在
curl -s http://127.0.0.1:3000/backtest.html | \
  grep -o 'id="maxPosition"' | head -1

# 验证前端请求组装（浏览器控制台）
# 1. 打开 backtest.html
# 2. 填写回测参数
# 3. 点击"开始回测"
# 4. 查看 Network 面板，确认请求体包含 gridConfig.maxPosition
```

---

## 📝 使用说明

### 用户操作流程
1. 打开 `http://127.0.0.1:3000/backtest.html`
2. 在"网格交易参数"区域找到"最大持仓数"输入框
3. 输入 1-20 之间的整数
4. 点击"开始回测"，参数会传递到后端 API

### API 接收参数
```json
{
  "strategy": "grid_trading",
  "gridConfig": {
    "maxPosition": 5,
    "gridSize": 0.02,
    "takeProfit": 0.05
  }
}
```

---

## 📝 后续任务

- **TASK_E2E_FIX_004**: 回测结果显示（依赖本任务参数）

---

## 🔗 相关文档

- 修复计划：`docs/fixes/TASK_V4_V5_E2E_FIXES.md`
- API 合同：`docs/api-contracts/backtest-joint.md`

---

**交接人**: 灵爪  
**交接时间**: 2026-03-26 19:00  
**验收人**: Codex (2026-03-26 验收通过)
