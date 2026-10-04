# Differential Hypothesis Engine

## Purpose

A detected behavioral condition is not an explanation.

For example:

```text
TOOL_RETRY_SPIRAL
```

can be consistent with:

- service outage
- rate limiting
- result-delivery failure

Rung 6 makes those alternatives explicit and asks what evidence would best separate them.

## Hypothesis weights

SIcologist uses normalized **weights**.

The default prior is uniform across the declared alternatives for a condition unless the caller supplies explicit priors.

Weights are not calibrated probabilities and must not be described as confidence that an explanation is objectively true.

Every differential snapshot carries:

```text
evidenceModel = ENGINEERING_HEURISTIC_V0.1
calibration = UNVALIDATED
explanationStatus = NOT_ESTABLISHED
```

## Default likelihood model

Rung 6 ships a hand-authored engineering table that estimates how likely each probe is to return its declared positive criterion under each alternative.

These values exist to exercise deterministic differential reasoning and information-gain selection.

They are **not empirical frequencies**.

Future measured datasets should replace or calibrate them.

## Probe evidence

A probe adapter reports one of:

- `POSITIVE`
- `NEGATIVE`
- `INCONCLUSIVE`

The meaning of POSITIVE is defined per probe in the evidence catalog. Adapters must not improvise the meaning at runtime.

A reliability value in `[0,1]` can temper an evidence update. Reliability 0 leaves the likelihood at 0.5 and therefore changes nothing.

## Information gain

The engine evaluates all unused probes and predicts how much each is expected to reduce uncertainty.

This gives a principled answer to:

> Which test should we run next?

rather than:

> Which explanation sounds coolest?

A small but apparently historically difficult distinction.

## Leading hypothesis

The engine may report `LEADING_HYPOTHESIS` when evidence has been observed and the top weight is at least 0.75 with at least a 0.25 gap over second place.

It never reports `CONFIRMED`.

## Case integration

A differential snapshot can be written into a Rung 5 case via:

```js
caseFile.recordDifferential(engine.snapshot());
```

That preserves the exact evidence model, ranking, evidence trace, and recommended next probe at that point in the case.
