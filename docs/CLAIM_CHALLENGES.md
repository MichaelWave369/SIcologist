# Falsification + Claim Challenge Engine

## Purpose

Rung 15 gives explicit Rung 14 claims preregistered attempts to fail.

The challenge engine is built around one rule:

    decide what the result means before seeing the result

## Preregistered contract

A challenge is bound to one current target claim revision and one current rival claim revision.

The contract freezes:

- challenge question
- expected observation
- explicit falsifier
- boundary conditions
- discriminating probe
- observation labels
- observation-to-outcome decision table

The discriminating probe must already exist in the SIcologist probe catalog.

## Decision-table requirement

The table must contain at least:

- one observation that maps to SURVIVED_CHALLENGE
- one observation that maps to CONTRADICTED

This prevents a so-called falsification test in which every possible result somehow supports the favored claim. Humans have invented that design often enough without help from the runtime.

WEAKENED and INCONCLUSIVE outcomes are optional.

## Claim revision freeze

If either the target claim or rival claim is superseded after preregistration, the challenge cannot be executed against the old contract.

A new challenge must be preregistered for the new claim revision.

This prevents post-hoc wording changes from moving the target during the experiment.

## Result

The result records:

- frozen contract ID
- target and rival claim IDs
- probe ID
- observed preregistered label
- resulting preregistered outcome
- evidence artifact fingerprint
- declared evaluator ID
- note
- interpretation boundaries

The evidence artifact must verify its own fingerprint.

## Claim integration

A resolved challenge can be attached to the target claim as a verified CLAIM_CHALLENGE_RESULT artifact.

Outcome maps to claim evidence as:

    SURVIVED_CHALLENGE -> SUPPORTS
    WEAKENED          -> QUALIFIES
    CONTRADICTED      -> CONTRADICTS
    INCONCLUSIVE      -> CONTEXT

No evidence is automatically attached to the rival claim.

## Interpretation boundary

The result always retains:

    targetClaimProven = false
    rivalClaimProven = false
    causalityEstablished = false

A target claim surviving one challenge is not proof. A target claim failing one challenge does not automatically establish the rival.
