# Claim Stress Lab + Adversarial Challenge Generator

## Purpose

Rung 16 helps choose which Rung 15 falsification challenge should be preregistered.

It does not execute challenges.

## Explicit hypothesis binding

The stress lab does not infer hypothesis identity from natural-language claim text.

The caller must provide:

- target claim revision
- rival claim revision
- condition ID
- target hypothesis ID
- rival hypothesis ID

The hypothesis IDs must exist in the selected differential specification.

If a claim declares scope.conditionId, it must match the requested condition.

## Candidate generation

Each probe declared by the differential specification becomes a candidate only when it separates the selected hypothesis pair.

For each candidate SIcologist computes:

- expected information gain over the target/rival pair
- absolute positive-likelihood separation
- estimated cost in [0,1]
- estimated invasiveness in [0,1]

The default score is:

    0.45 * informationGain
  + 0.35 * discrimination
  + 0.15 * costEfficiency
  + 0.05 * lowInvasiveness

where:

    costEfficiency = 1 - estimatedCost
    lowInvasiveness = 1 - estimatedInvasiveness

Weights must sum exactly to 1 and are stored in the report.

## Cost boundary

Probe cost values are frozen engineering defaults.

They are not measured wall-clock time, money, token use, energy, or external API spend.

Callers may supply explicit overrides; the report records whether overrides were used.

## Decision direction

The differential likelihood model determines which binary probe result favors which hypothesis.

For example, if:

    P(POSITIVE | target) > P(POSITIVE | rival)

then the generated Rung 15 decision table uses:

    PROBE_POSITIVE -> SURVIVED_CHALLENGE
    PROBE_NEGATIVE -> CONTRADICTED
    PROBE_INCONCLUSIVE -> INCONCLUSIVE

The opposite mapping is used when the positive result favors the rival.

This is a pairwise model comparison, not proof of either claim.

## Authority boundary

Every stress candidate contains:

    recommendationOnly = true
    executionAuthorized = false
    preregistered = false

The stress report itself contains:

    generatorExecutesProbes = false
    generatorPreregistersAutomatically = false
    operatorSelectionRequired = true
    claimTruthEstablished = false

## Operator selection

preregisterStressCandidate requires:

- an untampered stress report
- the exact candidate ID
- current unchanged claim revisions
- operatorApproved = true
- a non-empty approval receipt

It then creates a Rung 15 preregistered challenge.

The selection receipt still says executionAuthorized=false. A later execution path must satisfy the Rung 15 evidence rules.

## Model boundary

Ranking quality depends on the supplied differential specification.

When the default Rung 6 engineering heuristic is used, its calibration remains UNVALIDATED.

A calibrated empirical specification can be injected explicitly, and its model/version metadata is preserved in the report.
