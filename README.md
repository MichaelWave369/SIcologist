# SIcologist

**Synthetic Intelligence Behavioral Observatory & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing agent behavior, detecting operational deviations, testing competing explanations, planning minimally invasive recovery actions, and recording whether recovery actually occurred.

> SIcologist classifies **observable synthetic-agent behavior**. It does not claim that models are conscious, emotional, mentally ill, or equivalent to human patients.

## Core loop

```text
Agent -> Observation -> Baseline comparison -> Behavioral assessment
      -> Competing explanations -> Probe -> Governed intervention plan
      -> Re-measurement -> Recovery / escalation / refusal -> Ledger
```

## Rung 1

- 12 operational behavioral conditions, `SC-001` through `SC-012`
- deterministic normalized telemetry assessment
- baseline-delta reporting
- minimal-intervention planning with authority boundaries
- recovery comparison
- hash-chained evidence ledger
- JSON contracts
- zero runtime dependencies
- Node built-in tests and CI

## Quick start

Requires Node.js 20+.

```bash
npm test
npm run validate
npm run example
```

## Design rules

1. Evidence before labels.
2. Conditions describe system behavior, not personhood.
3. Prefer probes before interventions.
4. Prefer the least invasive reversible intervention.
5. Never silently cross an authority boundary.
6. Record what changed and whether it helped.
7. Preserve replayability.

See [CONSTITUTION.md](docs/CONSTITUTION.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT.
