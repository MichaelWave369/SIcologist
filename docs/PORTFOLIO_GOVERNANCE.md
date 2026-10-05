# Portfolio Outcomes + Program Governance

## Purpose

Rung 20 makes the Rung 19 portfolio accountable to the downstream research it recommended.

It answers:

    Which allocations were actually selected?
    Which selected campaigns completed a challenge?
    Which results reached the claim evidence graph?
    What descriptive outcome pattern followed?

It does not claim that portfolio priority caused those outcomes.

## Selection chain

A governance selection is accepted only when four artifacts line up:

    Rung 19 portfolio allocation
        |
        v
    operator portfolio selection receipt
        |
        v
    exact Rung 17 campaign selection
        |
        v
    Rung 15 challenge contract

The portfolio allocation's recommended step must equal the campaign selection's exact step.

The campaign selection's plan must equal the portfolio program's plan.

Duplicate credit for the same portfolio allocation is rejected.

## Outcome gate

A selection does not become a completed governance outcome merely because an experiment was attempted.

Rung 20 requires:

1. the selected Rung 15 challenge has a verified result
2. that result is attached to the target claim's Rung 14 evidence graph
3. the current claim assessment can be recomputed

Only then is an immutable governance outcome written.

## Outcome record

Each completed outcome records:

- allocated rank
- priority score
- estimated cost
- selected probe
- challenge outcome
- decisive vs inconclusive classification
- before claim assessment
- after claim assessment
- target revision change
- evidence-attachment confirmation

The result boundary remains:

    allocationEffectCausality = NOT_ESTABLISHED
    priorityPolicyValidated = false
    scientificTruth = NOT_ESTABLISHED

## Governance summary

The registry reports:

- number of portfolio selections
- completed outcomes
- pending outcomes
- completion rate
- decisive outcome rate
- inconclusive rate
- contradiction rate
- outcome counts
- unique portfolios
- unique portfolio policies
- unique program IDs
- allocated estimated cost
- completed estimated cost

Estimated cost remains the Rung 16/19 engineering estimate. It is not measured money, compute, energy, tokens, or wall-clock time.

## Governance review

Default review policy:

    minimum completed outcomes for rate review = 3
    maximum inconclusive rate = 0.50
    maximum contradiction rate = 0.50

Possible flags:

    PENDING_OUTCOMES_PRESENT
    HIGH_INCONCLUSIVE_RATE
    HIGH_CONTRADICTION_RATE

These flags request human attention. They are not automatic policy updates.

Every review says:

    automaticWeightUpdate = false
    automaticBudgetUpdate = false
    automaticExecutionChange = false
    policyRecommendation = DESCRIPTIVE_REVIEW_ONLY

## Why no automatic weight tuning?

Observed challenge outcomes are not randomized evidence about the causal value of the portfolio weights.

Portfolio selection is confounded by operator importance, available campaigns, eligibility gates, budget limits, differential models, and the scientific state of each claim.

A high contradiction rate might mean poor prioritization. It might also mean excellent falsification targeting.

Rung 20 therefore reports the pattern without pretending it has identified the cause.

## Boundary

A governance registry audits program decisions.

It is not an autonomous research director and cannot rewrite its own policy, expand its own budget, or authorize experiments.
