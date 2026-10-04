# Architecture

```text
Agent / Runtime
      |
      v
Session Observatory
      |
      +--------------------+
      |                    |
      v                    v
Universal Assessment   Longitudinal Profile
      |                    |
      +---------+----------+
                |
                v
             Case File
                |
      +---------+----------+
      |                    |
      v                    v
 Probe Engine       Intervention Planner
      |                    |
      v               Governance Gate
 Differential             |
 Evidence                 v
      |           External Execution Adapter
      |                    |
      +---------+----------+
                |
                v
        Recovery Measurement
                |
                v
        Case Outcome History
                |
                v
  Evidence-Informed Recommendation
                |
                v
          Reality / Case Ledger
```

## Rung 5 boundary

A case file is an operational incident record for software agents.

It is not a medical chart.

An intervention history summarizes observed associations between actions and subsequent measured outcomes. It does not establish causal mechanism.

```text
history != mechanism
association != causation
recommendation != authority
case record != diagnosis
```

## Case chronology

Each case event carries:

- monotonically increasing sequence
- stable case ID
- event type
- event payload
- previous event hash
- current event hash
- deterministic or caller-supplied timestamp marker

The chain is independently verifiable.

## Intervention linkage

Every applied intervention gets a stable `interventionId`. A recovery record references that identifier. This prevents the system from vaguely claiming that "something we did earlier" worked.

## Learning from history

Historical recommendations are ranked from measured intervention episodes. The output includes attempts, measured outcomes, recovered/improved/unchanged/degraded counts, average condition-score improvement, authorization class, and an explicit `CAUSALITY_NOT_ESTABLISHED` marker.
