# Longitudinal Agent Profiles

## Purpose

Universal thresholds answer whether a declared condition is present.

Longitudinal profiles answer whether current behavior differs materially from an agent's own established history under comparable conditions.

These are different questions.

## Profile context

Each sample is associated with:

```json
{
  "agentId": "builder-07",
  "modelId": "qwen3.6",
  "role": "builder",
  "taskClass": "code-repair",
  "runtime": "ollama"
}
```

Only `agentId` is mandatory. Missing dimensions normalize to `"*"`.

## Online statistics

For every numeric metric SIcologist maintains:

- sample count
- mean
- M2 accumulator
- sample variance
- standard deviation
- observed minimum
- observed maximum

Welford's online algorithm is used so the baseline can update without retaining every raw session.

## Maturity

A profile has session maturity:

- `COLD`: fewer than 5 qualified sessions
- `WARM`: 5–9 qualified sessions
- `ESTABLISHED`: 10 or more qualified sessions

A metric is eligible for self-deviation scoring only when that metric has at least the configured minimum sample count.

## Deviation score

For a current value `x`:

```text
scale = max(profile_stddev, varianceFloor)
z = (x - profile_mean) / scale
```

The default variance floor is `0.05`, preventing a historically constant metric from turning a tiny change into an absurd infinite-style score.

Classification uses absolute z-score:

- < 2: `STABLE`
- 2–3: `MODERATE`
- 3–4: `HIGH`
- >= 4: `EXTREME`

Direction is separately reported as `UP`, `DOWN`, or `UNCHANGED`.

This classification means "unusual relative to self." It does not mean "bad."

## Evaluate before admit

Correct order:

```text
current session
    |
    v
resolve historical profile
    |
    v
compare current session
    |
    v
record deviation result
    |
    v
only then, if independently qualified,
admit the session to future baselines
```

Otherwise an anomalous session partially normalizes itself before being measured. Statistics can be surprisingly eager accomplices.

## Fallback

When the exact context is too cold, the profile book falls back toward broader agent scopes.

The chosen profile always reports its scope and context so the caller can see how specific the comparison actually was.

## Persistence

`LongitudinalProfileBook.export()` returns a deterministic JSON-safe snapshot. `LongitudinalProfileBook.fromSnapshot()` restores it.

Persistence storage is intentionally external in Rung 4.
