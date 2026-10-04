# Independent Evaluator Package + Custody Split

## Purpose

Rung 11 separates the label holder from the model runner using portable artifacts rather than a single in-process harness.

## Package flow

    approved EVAL_QUARANTINE dataset
              |
              v
       evaluator custody split
          /             \
         /               \
 PUBLIC challenge     PRIVATE custody
       |                   |
       v                   |
 model runner              |
       |                   |
       v                   |
 frozen submission         |
         \                 /
          \               /
            evaluator score
                 |
                 v
        immutable receipt

## Public challenge bundle

The public bundle contains trial IDs, condition IDs, probe outcomes, the label commitment, and evaluation-set fingerprint.

It does not contain adjudicated reference labels, source references, approval receipts, or raw agent identity.

## Private custody bundle

The private bundle contains the adjudicated reference labels and is bound to the exact public challenge by challenge fingerprint, evaluation-set fingerprint, and label commitment.

Mixing a custody package from one challenge with another challenge is rejected.

## Model submission

The runner freezes a model ID, model version, and artifact SHA-256. It submits exactly one normalized ranking for every challenge trial.

The complete prediction set is fingerprinted before scoring.

## Evaluation receipt

The evaluator verifies both package fingerprints and all commitments before scoring.

The receipt includes proper scoring metrics and records:

    labelRevealTiming = AFTER_EXTERNAL_SUBMISSION_COMMIT
    custodySeparation = SPLIT_PACKAGE_VERIFIED
    custodyIndependence = NOT_ESTABLISHED
    labelSemantics = ADJUDICATED_REFERENCE
    productionStatus = NOT_VALIDATED

## Ed25519 evaluator signature

The evaluator may sign the immutable receipt fingerprint with an Ed25519 private key. Verification uses the corresponding public key.

The signature envelope includes a fingerprint of that public key.

This establishes cryptographic key possession only.

It does not establish legal identity, institutional accreditation, organizational independence, or honest custody.

Those require external trust infrastructure and operating evidence.

## Why custodyIndependence stays NOT_ESTABLISHED

The software can prove that the challenge and custody files are separate and that the model submission was committed before scoring.

It cannot prove where files physically resided, who had access to them, or whether the evaluator secretly shared labels outside the protocol.

Rung 11 therefore strengthens evidentiary custody without overselling what code alone can establish.
