# Case Files + Intervention History

## Purpose

Rung 5 gives SIcologist a durable operational memory for incidents.

A case captures chronology, evidence, interventions, and outcomes without rewriting earlier observations after the fact.

## Event types

```text
CASE_OPENED
ASSESSMENT_RECORDED
PROFILE_COMPARISON_RECORDED
PROBE_RECORDED
INTERVENTION_PLANNED
INTERVENTION_APPLIED
RECOVERY_RECORDED
NOTE_ADDED
CASE_CLOSED
CASE_REOPENED
```

## Intervention lifecycle

```text
plan
  -> governance decision
  -> applied intervention
  -> re-measure
  -> recovery record linked by interventionId
```

A recovery event cannot reference an intervention that does not exist in the same case.

## Recovery outcomes

- `RECOVERED`: condition score reached zero from a positive baseline
- `IMPROVED`: condition score decreased but remains non-zero
- `UNCHANGED`
- `DEGRADED`
- `INSUFFICIENT_DATA`

Rung 5 fixes an important subtlety: a condition that no longer meets **all** activation rules may still partially match its rules. That is improvement, not necessarily full recovery.

## Historical effectiveness

For each action + target condition, the history layer reports:

- attempts
- measured outcomes
- recovered
- improved
- unchanged
- degraded
- pending / unmeasured
- benefit rate
- average condition-score delta

The system can rank historically useful interventions only when a minimum number of measured episodes exists.

## Causal restraint

Every historical recommendation carries:

```text
causalStatus = CAUSALITY_NOT_ESTABLISHED
evidenceKind = OBSERVATIONAL_HISTORY
```

Controlled Rung 3 experiments are stronger evidence than uncontrolled case history. Rung 5 does not blur that distinction.

## Recurrence

Case books can count how many distinct cases for an agent contain evidence of the same condition. This is episode recurrence, not a psychiatric recurrence diagnosis.

## Persistence

`CaseBook.export()` returns a deterministic JSON-safe snapshot with a top-level fingerprint. `CaseBook.fromSnapshot()` verifies the fingerprint before restoring it.
