# Architecture

```text
Agent / Runtime
      |
      v
Session Event Adapter
      |
      v
Agent Session Observatory
      |
      +--> deterministic event normalization
      |
      +--> behavioral metric extraction
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

## Rung 2 boundary

Rung 2 observes and derives. It still does not directly call an LLM, mutate prompts, clear memory, disable tools, switch models, or grant authority.

```text
observation != interpretation
assessment != authority
recommendation != execution
capability != permission
```

The session layer is deliberately adapter-friendly. A PhiVessel, PhiBot, local Ollama harness, replay runner, or any other agent runtime can emit the same canonical event vocabulary.

## Modules

- `conditions.js`: versioned behavioral-condition catalog
- `assess.js`: deterministic condition evaluation with missing-data awareness
- `interventions.js`: governed action planning
- `recovery.js`: before/after comparison
- `ledger.js`: hash-chained evidence record
- `session/events.js`: canonical session-event vocabulary and validation
- `session/metrics.js`: deterministic metric extraction
- `session/observatory.js`: streaming session observer and report generation
