# TASK_ITERATION_MANAGER_FIX_001 - 总收益显示格式修复

**状态**: done  
**开发者**: 灵爪  
**验收员**: 待验收  
**最后更新**: 2026-03-31 11:25

---

## 问题描述
策略版本历史页面中，总收益显示为 `¥0`，但夏普比率、最大回撤等指标正常。

## 根因分析
- 数据库 `strategy_versions.total_return` 存储的是**收益率**（如 0.402441 = 40.24%）
- 前端显示时误用金额格式化：`¥${Number(value).toLocaleString()}` 
- 导致 `0.402441` 四舍五入显示为 `¥0`

## 修复内容
| 文件 | 修改内容 |
|------|----------|
| `iteration-manager.html` | 总收益显示从金额格式改为收益率百分比 |

**修改前**:
```javascript
['总收益', v.total_return, value => `¥${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`]
```

**修改后**:
```javascript
['总收益', v.total_return, value => `${(Number(value) * 100).toFixed(2)}%`]
```

## 显示效果对比
| total_return 值 | 修改前 | 修改后 |
|----------------|--------|--------|
| 0.402441 | ¥0 | 40.24% |
| 0.129606 | ¥0 | 12.96% |
| -0.001293 | ¥0 | -0.13% |

## 验证步骤
```bash
# 1. 刷新策略迭代页面
http://127.0.0.1:3000/iteration-manager.html

# 2. 查看策略版本历史
# 预期：总收益显示为百分比格式（如 40.24%）
```

## 相关文档
- `memory/2026-03-31.md` - 当天过程记录
- `docs/handover/TASK_ITERATION_MANAGER_FIX_001_HANDOVER.md` - 交接文档
