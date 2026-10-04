# Experimental Probe Engine

## Purpose

A behavioral condition can have many explanations. SIcologist therefore treats a condition finding as a hypothesis generator, not a diagnosis.

Rung 3 adds controlled comparison.

## Flow

```text
condition finding
  -> candidate probes
  -> experiment plan
  -> control replay
  -> treatment/shadow replay
  -> same observatory
  -> same metrics
  -> differential
  -> ranked evidence
```

## Causal restraint

Every pairwise probe result carries:

```text
causalStatus = CAUSALITY_NOT_ESTABLISHED
```

A large differential is useful evidence for follow-up. It is not permission to say the probe found "the cause."

## Evidence classes

- `STRONG_DIFFERENTIAL`: target condition score falls by at least 0.50
- `MODERATE_DIFFERENTIAL`: falls by at least 0.25
- `NO_CLEAR_DIFFERENTIAL`: change is smaller than 0.25
- `COUNTERSIGNAL`: target condition score rises by at least 0.25
- `NO_BASELINE_CONDITION`: target condition was not active in control
- `INSUFFICIENT_DATA`: the condition could not be evaluated in one or both arms

Thresholds are simple Rung 3 engineering defaults, not scientific universal constants.

## Runner interface

```js
const results = await executeProbePlan({
  sourceEvents,
  assessment,
  runner: async ({ arm, sourceEvents }) => {
    // Run an isolated replay / sandbox / agent experiment.
    // Return canonical SIcologist session events.
    return treatmentEvents;
  }
});
```

The engine never assumes the runner is trustworthy. Returned sessions are re-observed and fingerprinted.
