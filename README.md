# SIcologist

Synthetic Intelligence Behavioral Observatory, Experimental Probe & Governed Recovery Runtime.

SIcologist is a deterministic, model-agnostic framework for observing agent behavior, detecting operational deviations, testing competing explanations, planning minimally invasive recovery actions, and recording whether recovery actually occurred.

SIcologist classifies observable synthetic-agent behavior. It does not claim that models are conscious, emotional, mentally ill, or equivalent to human patients.

## Rungs

Rung 1: Behavioral core.
Rung 2: Agent Session Observatory.
Rung 3: Experimental Probe Engine and software-only Phi Interferometer.
Rung 4: Longitudinal Agent Profiles.
Rung 5: Case Files and Intervention History.
Rung 6: Differential Hypothesis Engine.
Rung 7: Blind Case Conference.
Rung 8: Calibration and Benchmark Lab.

## Rung 8

Rung 8 adds:

- a frozen deterministic synthetic benchmark recipe
- 336 labeled cases spanning all 12 conditions and all 28 declared hypotheses
- 224 TRAIN cases and 112 HELDOUT cases
- a pinned benchmark SHA-256 fingerprint
- beta-smoothed empirical probe likelihood fitting
- train-only model estimation
- fitted class priors
- differential-engine support for injected empirical specs
- held-out multiclass accuracy
- multiclass Brier score
- log loss
- expected calibration error
- confidence bins
- per-condition confusion matrices
- held-out probe-likelihood Brier score
- heuristic-versus-empirical comparison
- versioned calibrated-model artifacts with fingerprints

The first benchmark is deliberately synthetic:

    datasetKind = SYNTHETIC_FROZEN
    externalValidity = NOT_ESTABLISHED

Passing it validates the calibration machinery against frozen known labels. It does not establish real-world agent validity.

## Quick start

~~~bash
npm test
npm run validate
npm run benchmark
~~~

## Design rules

1. Evidence before labels.
2. Unknown is not zero.
3. Consensus is not truth.
4. Calibration uses a train/held-out split.
5. Held-out labels never fit model likelihoods.
6. Synthetic benchmark success is not external validation.
7. Model artifacts include dataset and training fingerprints.
8. Never silently cross an authority boundary.
9. Preserve replayability and provenance.

## License

MIT.
