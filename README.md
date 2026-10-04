# SIcologist

**Synthetic Intelligence Behavioral Observatory, Experimental Probe & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing software-agent behavior, testing competing explanations, governing interventions, measuring recovery, and preserving replayable evidence.

> SIcologist classifies observable synthetic-agent behavior. It does not claim consciousness, emotion, psychiatric illness, or human-equivalent subjective experience.

## Rungs

1. Behavioral core
2. Agent Session Observatory
3. Experimental Probe Engine + software-only Φ Interferometer
4. Longitudinal Agent Profiles
5. Case Files + Intervention History
6. Differential Hypothesis Engine
7. Blind Case Conference
8. Calibration + Benchmark Lab
9. Real-Case Evidence Intake + Dataset Builder
10. Sealed External Evaluation Harness

## Rung 10

Rung 10 evaluates a frozen model against approved EVAL_QUARANTINE cases without exposing reference labels through the runner API before predictions are committed.

The protocol freezes three independent commitments:

    reference-label commitment
    model-artifact commitment
    prediction-set commitment

Only after the prediction commitment exists can an authorized reveal score the run.

The public evaluation manifest contains trial IDs, conditions, and probe outcomes. It omits adjudicated labels, raw source references, approval receipts, and raw agent identity.

Every closed receipt records:

    labelRevealTiming = AFTER_PREDICTION_COMMIT
    labelSemantics = ADJUDICATED_REFERENCE
    evaluationStatus = SEALED_REFERENCE_EVALUATION_COMPLETE
    externalValidity = CANDIDATE
    custodyIndependence = NOT_ESTABLISHED
    productionStatus = NOT_VALIDATED

This proves ordering and commitment integrity within the protocol. It does not prove that a genuinely independent third party held the labels.

## Quick start

    npm test
    npm run validate
    npm run evaluate:sealed

## License

MIT.
