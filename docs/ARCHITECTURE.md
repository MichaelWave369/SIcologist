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
                v
      Differential Hypothesis Engine
                |
       +--------+--------+
       |                 |
       v                 v
Probe Information    Hypothesis Weight
Gain Ranking         Update
       |                 |
       +--------+--------+
                |
                v
          Probe Engine
                |
                v
      Governed Intervention
                |
                v
        Recovery Measurement
                |
                v
          Case / History
```

## Rung 6 boundary

The differential engine ranks explicit candidate explanations using declared priors and likelihoods.

The default likelihood table is:

```text
ENGINEERING_HEURISTIC_V0.1
calibration = UNVALIDATED
```

It is scaffolding for choosing informative probes. It is not a learned scientific model and must not be presented as one.

```text
posterior weight != probability of truth
leading hypothesis != confirmed explanation
information gain != causation
ranking != authority
```

## Evidence update

For hypothesis `H_i`, current normalized weight `w_i`, probe positive likelihood `p_i`, and declared probe reliability `r`:

```text
effective_p_i = 0.5 + (p_i - 0.5) * r

positive evidence:
  new_weight_i ∝ w_i * effective_p_i

negative evidence:
  new_weight_i ∝ w_i * (1 - effective_p_i)
```

Weights are normalized after the update.

Inconclusive evidence is recorded but does not change weights.

## Probe choice

For each unused probe the engine computes Shannon entropy before the probe and expected entropy after positive/negative outcomes.

```text
information_gain =
  current_entropy - expected_posterior_entropy
```

The highest-scoring probe is recommended first.
