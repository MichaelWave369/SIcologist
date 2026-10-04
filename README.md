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
   -> differential hypotheses
   -> information-gain probe selection
   -> controlled evidence
   -> hypothesis-weight update
   -> governed intervention
   -> measured recovery
   -> case outcome + history
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
Hash-chained case chronology, intervention-to-recovery linkage, recurrence, and observational intervention history.

### Rung 6 — Differential Hypothesis Engine
- converts condition alternatives into explicit competing hypotheses
- keeps priors and posterior **weights** inspectable
- uses versioned, unvalidated engineering likelihoods rather than hidden model intuition
- ranks candidate probes by expected information gain
- accepts positive, negative, or inconclusive evidence
- records before/after hypothesis weights for every update
- never emits a "confirmed diagnosis"
- integrates differential snapshots into case chronology
- validates hypothesis/probe coverage across all declared conditions

Rung 6 answers:

```text
Given the evidence we have,
which explanation currently deserves the most weight,
and which next probe should reduce uncertainty the most?
```

The normalized weights are reasoning aids, **not calibrated probabilities of truth**.

## Quick start

Requires Node.js 20+.

```bash
npm test
npm run validate
npm run differential
```

## Design rules

1. Evidence before labels.
2. Conditions describe system behavior, not personhood.
3. Unknown is not zero.
4. Hypothesis weights are inspectable and versioned.
5. No hypothesis becomes "confirmed" merely because it leads the ranking.
6. Prefer the probe with the greatest declared information value.
7. A baseline only learns from explicitly qualified evidence.
8. Historical success is association until controlled evidence says more.
9. Never silently cross an authority boundary.
10. Preserve replayability and provenance.

See the documents in [docs/](docs/).

## License

MIT.
