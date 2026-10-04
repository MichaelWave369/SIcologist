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
      +--------------------------+
      |                          |
      v                          v
Universal Condition      Longitudinal Profile
Assessor                  Comparator
      |                          |
      +------------+-------------+
                   |
                   v
        Explanation / Probe Layer
                   |
         +---------+---------+
         |                   |
         v                   v
  Probe Planner      Intervention Planner
         |                   |
         v              Governance Gate
 Shadow / Replay            |
         |                   v
         v          External Execution Adapter
 Differential Evidence      |
         |                   v
         +------------> Recovery Comparator
                              |
                              v
                         Evidence Ledger
```

## Rung 4 profile boundary

Longitudinal baselines are descriptive statistics over qualified software-agent telemetry. They are not personality tests, psychiatric profiles, or evidence of consciousness.

```text
unusual != harmful
normal != safe
baseline != authority
correlation != causation
```

A session is evaluated against the existing profile **before** it can be admitted into that profile. This prevents the current observation from diluting its own deviation.

## Context scopes

Profile samples are accumulated into four deterministic scopes:

1. exact agent + model + role + task class + runtime
2. agent + model + role + task class, any runtime
3. agent + model + role, any task/runtime
4. agent global, any model/role/task/runtime

Resolution chooses the most specific mature profile available.

## Baseline admission

A session is rejected from longitudinal training when:

- it is not explicitly marked `QUALIFIED`
- its source is not trusted
- its ledger is invalid
- it contains an active critical condition and no explicit critical override was supplied
- the sample identifier has already been admitted
- no numeric metrics are present

This is baseline-poisoning resistance, not a claim that qualified samples are objectively correct.
