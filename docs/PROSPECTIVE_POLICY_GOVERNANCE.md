# Policy Revision + Prospective A/B Governance

## Purpose

Rung 21 tests proposed changes to the Rung 19 portfolio policy without rewriting historical allocations or treating retrospective outcomes as validation.

The central rule is:

    propose from history
    evaluate on future rounds

Historical Rung 20 outcomes may motivate a candidate policy. They do not count as prospective evidence that the candidate is better.

## Policy revision

A candidate policy revision requires:

- a valid baseline Rung 19 policy
- a different proposed policy
- a fingerprinted Rung 20 governance review
- a revision reason
- proposer identity

The revision remains:

    PROPOSED_NOT_ACTIVATED

Its boundaries include:

    retrospectiveOutcomeReuseForPromotion = false
    automaticActivation = false
    automaticWeightUpdate = false
    scientificSuperiority = NOT_ESTABLISHED

## Trial preregistration

A prospective trial freezes before future rounds:

- baseline policy
- candidate policy
- assignment mode
- minimum round count
- primary metrics
- operator approval receipt

Metrics cannot be changed later without creating a different trial fingerprint.

Supported primary metrics:

- decisiveRate
- inconclusiveRate
- contradictionRate
- completedOutcomeCount

## Assignment modes

### BASELINE_ACTIVE_CANDIDATE_SHADOW

The baseline policy remains active every round.

The candidate generates shadow recommendations only.

This measures recommendation disagreement but produces no candidate-arm outcome evidence.

### ALTERNATING_AB

Odd rounds use baseline.

Even rounds use candidate.

This is deterministic alternation, not randomized assignment.

Therefore:

    externallyRandomized = false
    causalInference = NOT_ESTABLISHED

## Same-cohort comparison

For every round, SIcologist fingerprints the exact cohort:

- program IDs
- tracker fingerprints
- plan fingerprints
- operator importance values

Both policies are evaluated against that same cohort.

The comparison reports:

- priority-score deltas
- allocation agreement
- baseline-only allocations
- candidate-only allocations
- exact rank agreement
- active arm
- shadow arm

The shadow portfolio has no execution authority.

## Outcome attachment

A round outcome is accepted only from the Rung 20 governance registry for that round's active portfolio.

The active arm must have:

- at least one governance selection
- no pending selected outcomes
- at least one completed governance outcome

Candidate shadow recommendations cannot manufacture candidate outcome evidence.

## Trial summary

The trial summary aggregates active-arm prospective outcomes separately for baseline and candidate.

It reports:

- assigned rounds
- completed outcomes
- decisive rate
- inconclusive rate
- contradiction rate
- outcome counts
- candidate-minus-baseline rate deltas

Possible evaluation status:

    INSUFFICIENT_PROSPECTIVE_EVIDENCE
    SHADOW_COMPARISON_ONLY
    HUMAN_POLICY_REVIEW_REQUIRED

Even when minimum rounds are met:

    candidatePromotionAuthorized = false
    automaticPolicyActivation = false
    causalStatus = NOT_ESTABLISHED

## Why no automatic promotion?

The current built-in assignment modes are not externally randomized.

Differences may reflect cohort order, changing campaign availability, operator behavior, or other confounds.

Rung 21 can show prospective differences. It cannot honestly call those differences causal policy superiority.

## Boundary

Policy evaluation is governed experimentation on research allocation logic.

It does not alter scientific evidence attached to the underlying claims, and it never authorizes experiment execution.
