# SIcologist

**Synthetic Intelligence Behavioral Observatory, Experimental Probe & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing software-agent behavior, testing competing explanations, governing interventions, measuring recovery, and preserving replayable evidence.

> SIcologist classifies observable synthetic-agent behavior. It does not claim consciousness, emotion, psychiatric illness, or human-equivalent subjective experience.

## Rungs

1. Behavioral core
2. Agent Session Observatory
3. Experimental Probe Engine + software-only Phi Interferometer
4. Longitudinal Agent Profiles
5. Case Files + Intervention History
6. Differential Hypothesis Engine
7. Blind Case Conference
8. Calibration + Benchmark Lab
9. Real-Case Evidence Intake + Dataset Builder
10. Sealed External Evaluation Harness
11. Independent Evaluator Package + Custody Split
12. Reproducibility + External Replication Protocol
13. Replication Registry + Evidence Ladder
14. Claim Registry + Evidence Graph
15. Falsification + Claim Challenge Engine
16. Claim Stress Lab + Adversarial Challenge Generator
17. Research Campaign Planner

## Rung 17

Rung 17 turns one target claim, multiple registered rivals, and Rung 16 stress reports into a bounded research campaign.

The planner freezes:

    target claim revision
    rival claim revisions
    hypothesis bindings
    stress reports
    ranked candidate steps
    max step count
    estimated-cost budget
    stop and escalation rules

The default selection strategy first tries to cover distinct rivals with their strongest challenge, then spends remaining step/budget capacity on the strongest remaining candidates.

Every planned step retains:

    executionAuthorized = false
    operatorSelectionRequired = true
    checkpointRequiredAfterCompletion = true

The campaign tracker gates every next selection. It waits for the prior challenge result, then waits for that result to be attached to the claim evidence graph before continuing.

It stops or escalates when a challenge contradicts the target, the target is superseded, the next rival revision becomes stale, the claim becomes contested, or the plan is exhausted.

A campaign plan never executes probes or automatically advances to the next experiment.

## Quick start

    npm test
    npm run validate
    npm run campaign

## License

MIT.
