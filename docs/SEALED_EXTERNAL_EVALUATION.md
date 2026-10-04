# Sealed External Evaluation Harness

## Purpose

Rung 10 creates a commit-before-reveal evaluation protocol for Rung 9 evaluation-quarantine cases.

The core order is:

    freeze evaluation set
    commit reference labels
    freeze model artifact
    run label-hidden cases
    commit predictions
    authorize reveal
    reveal adjudicated references
    score
    fingerprint final receipt

## Evaluation manifest

The runner receives a public manifest containing only trial ID, condition ID, and probe outcomes for each case.

It does not receive the adjudicated reference hypothesis, source references, approval receipts, or raw agent identity.

## Commitments

### Label commitment

Reference labels are sorted and hashed before any model is registered or prediction is submitted.

### Model commitment

A model registration contains model ID, version, and a 64-character SHA-256 artifact fingerprint. The registration is frozen before predictions are accepted.

### Prediction commitment

Every evaluation trial must have exactly one normalized prediction over the full declared hypothesis space. The complete prediction set is sorted and hashed before label reveal.

## Reveal

Reference labels cannot be scored until the prediction commitment exists. Reveal requires explicit authorization and a non-empty reveal receipt.

## Scoring

The closed receipt reports accuracy, multiclass Brier score, log loss, expected calibration error, confidence bins, confusion matrices, and per-condition metrics.

## Integrity

The harness verifies the evaluation-dataset fingerprint, label commitment, prediction commitment, and presence of a frozen model commitment before closing the receipt.

## Scientific boundary

Sealed evaluation demonstrates that, through this API, predictions were frozen before adjudicated references were revealed.

It does not establish independent label custody. The receipt therefore carries:

    custodyIndependence = NOT_ESTABLISHED

A later independently operated evaluator can reuse the same commitment protocol while keeping the private label set outside the model-runner process.
