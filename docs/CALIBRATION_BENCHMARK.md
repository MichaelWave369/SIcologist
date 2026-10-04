# Calibration + Benchmark Lab

## Purpose

Rung 6 introduced explicit probe likelihoods. Those values were intentionally labeled ENGINEERING_HEURISTIC_V0.1 and UNVALIDATED.

Rung 8 adds machinery to fit and evaluate replacement likelihoods from labeled cases.

## Frozen synthetic benchmark v0.1

The initial benchmark is generated deterministically from a frozen recipe.

    version: SYNTHETIC_FROZEN_V0.1
    recipe: PATTERN_GRID_V0.1
    conditions: 12
    hypotheses: 28
    cases: 336
    train: 224
    heldout: 112
    fingerprint:
    27983d6c163aa6cafc29cf70dc82fd9c79a4318c75c6f209dcf9fd84ecab46d2

Every hypothesis contributes 12 cases. The first 8 are TRAIN and the final 4 are HELDOUT. Every case contains outcomes for both probes declared by its condition.

The recipe does not read Rung 6 heuristic likelihood values.

## Fitting

For hypothesis H and probe P:

    pPositive =
      (positive_train_count + alpha)
      /
      (observed_train_count + alpha + beta)

Defaults are alpha=1 and beta=1. Class priors also receive additive smoothing. Only TRAIN cases are used to fit the model.

## Held-out evaluation

Metrics include accuracy, multiclass Brier score, log loss, expected calibration error, confidence bins, per-condition confusion matrices, and probe-likelihood Brier score.

## Boundary

The synthetic benchmark can establish BENCHMARK_PIPELINE_VALID.

It cannot establish REAL_WORLD_CALIBRATED, PRODUCTION_VALIDATED, or CAUSAL_MODEL_ESTABLISHED.

Those require independently collected real-agent datasets and frozen external evaluation.
