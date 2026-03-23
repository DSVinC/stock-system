# Strategy Structured Schema Design (v2)

**Status**: Draft
**Version**: 2.0.0
**Last Updated**: 2026-03-23

## 1. Overview

To support automated trading (conditional orders) and richer UI displays (direction stock list), the `strategies` field in the analyzer output needs to be structured. This document defines the schema for the three types of strategies: aggressive, balanced, and conservative.

## 2. Root Structure

The `strategies` object contains three risk-level based strategies.

```typescript
interface Strategies {
  aggressive: Strategy;   // Aggressive strategy
  balanced: Strategy;     // Balanced strategy
  conservative: Strategy; // Conservative strategy
}

interface Strategy {
  risk_level: 'aggressive' | 'balanced' | 'conservative';
  actions: Action[];
  summary_text: string;   // Human-readable summary (for HTML reports and v1 compatibility)
}
```

## 3. Action Schema

Each strategy consists of a sequence of actions.

```typescript
interface Action {
  sequence: number;                      // Execution order (1, 2, 3...)
  action_type: 'buy' | 'sell' | 'hold';  // Type of transaction
  trigger_conditions: TriggerCondition[]; // List of conditions to trigger this action
  position_percent: number;              // Position size percentage (0-100)
  stop_loss?: number;                    // Optional stop loss price
  take_profit?: number;                  // Optional take profit price
  note: string;                          // Brief description/note
}
```

## 4. Trigger Condition Schema

Conditions that must be met for an action to execute.

```typescript
interface TriggerCondition {
  type: 'price' | 'indicator' | 'fundamental';
  field: string;                         // Field name (e.g., 'price', 'volume_ratio', 'ma20')
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number | string;                // Threshold value
  unit?: string;                         // Unit (e.g., '元', '%', '倍')
}
```

## 5. Backward Compatibility (v1)

To maintain backward compatibility with v1 consumers who expect `strategies.aggressive` (etc.) to be a string, the system employs two strategies:

1.  **Summary Text**: Each structured strategy object includes a `summary_text` field containing the original string representation.
2.  **API Transformation**: The Node.js API layer (`api/analysis.js`) provides a `downgradeToV1` function that detects v2 objects and converts them back to strings for the `/api/analysis` endpoint, while providing the full structured data via the `/api/v2/report` endpoint.

## 6. Implementation Checklist

- [x] Define Schema (this document)
- [x] Modify `stock_analyzer.py` to output structured JSON
- [x] Ensure `summary_text` is included in each strategy
- [x] Verify output with `python3 stock_analyzer.py --json <symbol>`
- [x] Update status in `docs/runtime/TASK_ANALYZE_STRUCT_001_STATUS.md`
