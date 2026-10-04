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
      v
Condition Assessor
      |
      +------------------------+
      |                        |
      v                        v
Probe Planner          Intervention Planner
      |                        |
      v                   Governance Gate
Shadow / Replay Runner         |
      |                        v
      v                External Execution Adapter
Differential Evidence          |
      |                        v
      +-----------> Recovery Comparator
                         |
                         v
                    Evidence Ledger
```

## Rung 3 experimental boundary

SIcologist now knows how to **design and score experiments**, but it still does not own an LLM or privileged execution channel.

A caller supplies a runner that executes a declared probe in a controlled copy, replay, sandbox, or shadow session.

```text
observation != interpretation
differential != causation
assessment != authority
recommendation != execution
capability != permission
```

## Φ Interferometer

The interferometer is a 2×2 factorial contrast over software-agent measurements:

```text
CONTROL  no perturbation
A        perturbation A only
B        perturbation B only
AB       A and B together

interaction = AB - A - B + CONTROL
```

A non-zero interaction means the combined response is non-additive relative to the measured metric. It does not, by itself, establish mechanism or causal truth.
