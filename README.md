# SIcologist

**Synthetic Intelligence Behavioral Observatory, Experimental Probe & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing agent behavior, detecting operational deviations, testing competing explanations, planning minimally invasive recovery actions, and recording whether recovery actually occurred.

> SIcologist classifies **observable synthetic-agent behavior**. It does not claim that models are conscious, emotional, mentally ill, or equivalent to human patients.

## Core loop

```text
Agent session
   -> event stream
   -> behavioral + longitudinal assessment
   -> case file
   -> competing explanations
   -> controlled probe / shadow replay
   -> intervention
   -> measured recovery
   -> case outcome
   -> historical effectiveness summary
   -> future evidence-informed recommendation
   -> evidence ledger
```

## Rungs

### Rung 1 — Behavioral core
Declared operational conditions, governance, recovery comparison, and hash-chained evidence.

### Rung 2 — Agent Session Observatory
Canonical session events and automatically derived behavioral telemetry.

### Rung 3 — Experimental Probe Engine
Controlled shadow experiments, differential evidence, and the software-only Φ Interferometer.

### Rung 4 — Longitudinal Agent Profiles
Contextual per-agent baselines with qualified admission, fallback cohorts, self-deviation scoring, and baseline-poisoning resistance.

### Rung 5 — Case Files + Intervention History
- deterministic per-agent operational case files
- append-only hash-chained case chronology
- assessment, profile, probe, intervention, recovery, note, close, and reopen events
- intervention-to-recovery linkage
- partial recovery scoring instead of binary disappearance
- recurrence tracking across cases
- historical intervention effectiveness summaries
- evidence-informed future recommendations
- explicit separation between historical association and causal proof
- deterministic case-book export/import with fingerprint verification

The case layer answers:

```text
What happened?
What evidence did we have?
What did we try?
Was it authorized?
What changed afterward?
Has this happened before?
What has historically helped this agent under comparable conditions?
```

It does **not** convert correlation into mechanism. Historical treatment success is operational evidence, not causal proof.

## Quick start

Requires Node.js 20+.

```bash
npm test
npm run validate
npm run observe -- fixtures/session-loop.json
npm run probe -- fixtures/probe-experiment.json
npm run interferometer
npm run profile
npm run cases
```

## Design rules

1. Evidence before labels.
2. Conditions describe system behavior, not personhood.
3. Unknown is not zero.
4. A probe result is evidence, not a causal verdict.
5. A baseline only learns from explicitly qualified evidence.
6. A case chronology is append-only evidence, not a rewritten narrative.
7. Link interventions to measured outcomes.
8. Historical success is association until controlled evidence says more.
9. Prefer the least invasive reversible intervention.
10. Never silently cross an authority boundary.
11. Preserve replayability and provenance.

See the documents in [docs/](docs/).

## License

MIT.
