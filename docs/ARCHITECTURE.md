# Architecture

```text
Observation Adapter
       |
       v
Baseline Comparator
       |
       v
Condition Assessor
       |
       v
Probe / Explanation Layer
       |
       v
Intervention Planner
       |
  Governance Gate
       |
       v
Execution Adapter (external)
       |
       v
Recovery Comparator
       |
       v
Evidence Ledger
```

## Rung 1 boundary
Rung 1 contains the deterministic domain core only. It does not directly call an LLM, mutate prompts, clear memory, disable tools, or switch models.

```text
assessment != authority
recommendation != execution
capability != permission
```

## Modules
- `conditions.js`: versioned behavioral-condition catalog
- `assess.js`: deterministic condition evaluation
- `interventions.js`: governed action planning
- `recovery.js`: before/after comparison
- `ledger.js`: hash-chained evidence record
