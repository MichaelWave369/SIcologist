# Policy Promotion + Rollback Governance

## Purpose

Rung 22 governs the transition from a Rung 21 prospective policy trial to an active Rung 19 portfolio policy.

It separates:

    promotion review
    activation
    post-activation monitoring
    rollback recommendation
    rollback execution

No step silently grants authority to the next.

## Promotion proposal

A policy promotion proposal requires:

- a verified Rung 21 policy revision
- the matching preregistered Rung 21 trial protocol
- the matching fingerprinted Rung 21 trial summary
- minimum prospective rounds met
- at least one baseline-assigned round
- at least one candidate-assigned round
- HUMAN_POLICY_REVIEW_REQUIRED status
- reviewer identity
- promotion rationale
- explicit risk acceptance
- frozen post-activation monitoring thresholds

The proposal remains:

    PROMOTION_REVIEWED_NOT_ACTIVATED

It explicitly retains:

    causalPolicySuperiority = NOT_ESTABLISHED

## Activation

Activation requires:

    operatorApproved = true
    non-empty approvalReceipt

Activation creates:

- an immutable activation receipt
- generation 1 of ACTIVE_PORTFOLIO_POLICY_STATE_V0.1

The active state contains both:

    activePolicy = promoted candidate
    rollbackPolicy = prior baseline

The previous policy is not deleted.

Activation grants only policy activation. It does not authorize portfolio selections, campaign selections, or experiments.

## Monitoring baseline

Activation snapshots the current Rung 20 governance registry.

All selection and outcome fingerprints that already exist become the monitoring baseline.

Post-activation monitoring ignores those records.

This prevents prospective-trial outcomes, historical governance evidence, or any pre-activation records from being reused as evidence about post-activation policy behavior.

## Post-activation monitoring

Default thresholds:

    minCompletedOutcomes = 3
    maxInconclusiveRate = 0.50
    maxContradictionRate = 0.50

Only new Rung 20 selections with:

    selection.policyFingerprint == activePolicyFingerprint

are monitored.

Only outcomes linked to those post-activation selections count.

Possible monitor status:

    INSUFFICIENT_POST_ACTIVATION_EVIDENCE
    CONTINUE_MONITORING
    ROLLBACK_REVIEW_RECOMMENDED

Possible flags:

    PENDING_POST_ACTIVATION_OUTCOMES
    HIGH_POST_ACTIVATION_INCONCLUSIVE_RATE
    HIGH_POST_ACTIVATION_CONTRADICTION_RATE

The monitor always says:

    rollbackAuthorized = false
    automaticRollback = false
    causalPolicyFailure = NOT_ESTABLISHED

## Rollback

Rollback requires:

- current verified active policy state
- verified monitor report for that exact state
- the exact governance snapshot used by the monitor
- operator approval
- approval receipt
- rollback reason

A rollback can follow a recommendation or be discretionary.

Discretionary rollback is explicitly recorded.

The resulting policy state:

- increments generation
- activates the preserved rollback policy
- preserves the former active policy as the next rollback target
- points to the prior policy-state fingerprint
- freezes a new monitoring baseline

## State lineage

Policy states form an immutable chain:

    generation 1: candidate active, baseline rollback target
             |
             v
    generation 2: baseline active, candidate rollback target
             |
             v
    generation 3: ...

Lineage verification requires continuous generations and exact previous-state fingerprints.

## Boundary

A rollback recommendation is an operational governance signal.

It does not prove that the active policy caused undesirable research outcomes.

A rollback is an operator policy action, not a scientific conclusion.
