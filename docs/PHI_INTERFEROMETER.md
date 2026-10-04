# Φ Interferometer

The Φ Interferometer is a software-only factorial experiment helper.

It asks:

> Does perturbation A combined with perturbation B produce an outcome different from the additive prediction based on each perturbation alone?

For metric `Y`:

```text
Y0  = control
YA  = A only
YB  = B only
YAB = A + B

additive_prediction_AB = YA + YB - Y0
interaction = YAB - additive_prediction_AB
            = YAB - YA - YB + Y0
```

Main effects are also reported:

```text
effect_A = ((YA + YAB) - (Y0 + YB)) / 2
effect_B = ((YB + YAB) - (Y0 + YA)) / 2
```

## Interpretation

With a declared threshold:

- positive interaction: combined response exceeds additive prediction
- negative interaction: combined response falls below additive prediction
- additive within threshold: no material non-additivity detected

## Important boundary

This is **not** RF interference, neuroscience, or evidence of agent consciousness.

It is ordinary factorial experimental analysis applied to software-agent behavioral metrics. The slightly dramatic name is permitted because apparently laboratories are legally required to own at least one device with a suspiciously cool title.
