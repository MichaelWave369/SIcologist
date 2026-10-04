# SIcologist

**Synthetic Intelligence Behavioral Observatory, Experimental Probe & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing agent behavior, detecting operational deviations, testing competing explanations, planning minimally invasive recovery actions, and recording whether recovery actually occurred.

> SIcologist classifies **observable synthetic-agent behavior**. It does not claim that models are conscious, emotional, mentally ill, or equivalent to human patients.

## Core loop

```text
Agent session
   -> event stream
   -> derived behavioral metrics
   -> universal condition assessment
   -> longitudinal self-baseline comparison
   -> competing explanations
   -> controlled probe / shadow replay
   -> differential evidence
   -> governed intervention plan
   -> re-measurement
   -> recovery / escalation / refusal
   -> evidence ledger
```

## Rungs

### Rung 1 — Behavioral core
- 12 operational conditions, `SC-001` through `SC-012`
- deterministic assessment
- governed intervention planning
- recovery comparison
- hash-chained evidence ledger

### Rung 2 — Agent Session Observatory
- canonical 12-event session vocabulary
- derived behavioral telemetry from session events
- strict event sequencing
- replay-stable observation
- missing telemetry remains unknown, never silently zero

### Rung 3 — Experimental Probe Engine
- condition-driven probe plans
- control vs treatment/shadow comparisons
- stable experiment fingerprints
- differential condition and metric evidence
- explicit `CAUSALITY_NOT_ESTABLISHED` boundary
- external runner interface for real agent runtimes
- ranked follow-up evidence
- **Φ Interferometer** 2×2 software interaction analysis

### Rung 4 — Longitudinal Agent Profiles
- per-agent contextual behavioral baselines
- exact and fallback cohort scopes
- online mean/variance/min/max statistics
- self-deviation z-scores with variance floor protection
- explicit profile maturity and metric coverage
- qualified-session admission gate
- duplicate-sample rejection
- invalid-ledger / untrusted / critical-session baseline-poisoning protection
- deterministic export/import for persistent profile stores
- evaluate-before-admit workflow to prevent the current session from normalizing itself

Rung 4 lets SIcologist ask two different questions:

```text
Universal:
"Does this session match a declared behavioral condition?"

Longitudinal:
"Is this session unusual for this specific agent in this context?"
```

Those are deliberately separate. A behavior can be unusual for an agent without being globally bad, and globally risky without being unusual for that agent.

## Quick start

Requires Node.js 20+.

```bash
npm test
npm run validate
npm run observe -- fixtures/session-loop.json
npm run probe -- fixtures/probe-experiment.json
npm run interferometer
npm run profile
```

## Design rules

1. Evidence before labels.
2. Conditions describe system behavior, not personhood.
3. Unknown is not zero.
4. A probe result is evidence, not a causal verdict.
5. Prefer controlled, reversible shadow experiments.
6. A baseline only learns from explicitly qualified evidence.
7. Evaluate a session before admitting it into its own baseline.
8. Prefer the least invasive reversible intervention.
9. Never silently cross an authority boundary.
10. Record what changed and whether it helped.
11. Preserve replayability.

See the documents in [docs/](docs/).

## License

MIT.
