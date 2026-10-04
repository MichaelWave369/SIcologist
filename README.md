# SIcologist

**Synthetic Intelligence Behavioral Observatory, Experimental Probe & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing agent behavior, detecting operational deviations, testing competing explanations, planning minimally invasive recovery actions, and recording whether recovery actually occurred.

> SIcologist classifies **observable synthetic-agent behavior**. It does not claim that models are conscious, emotional, mentally ill, or equivalent to human patients.

## Core loop

```text
Agent session
   -> event stream
   -> derived behavioral metrics
   -> condition assessment
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

The Φ Interferometer is a software experiment primitive. It measures whether two controlled perturbations interact non-additively:

```text
interaction = AB - A - B + CONTROL
```

It does **not** imply physical waves, consciousness, or causation by itself.

## Quick start

Requires Node.js 20+.

```bash
npm test
npm run validate
npm run observe -- fixtures/session-loop.json
npm run probe -- fixtures/probe-experiment.json
npm run interferometer
```

## Design rules

1. Evidence before labels.
2. Conditions describe system behavior, not personhood.
3. Unknown is not zero.
4. A probe result is evidence, not a causal verdict.
5. Prefer controlled, reversible shadow experiments.
6. Prefer the least invasive reversible intervention.
7. Never silently cross an authority boundary.
8. Record what changed and whether it helped.
9. Preserve replayability.

See the documents in [docs/](docs/).

## License

MIT.
