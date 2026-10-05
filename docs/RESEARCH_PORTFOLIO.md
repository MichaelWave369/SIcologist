# Research Program Portfolio + Resource Allocation

## Purpose

Rung 19 sits above individual Rung 17/18 campaigns and answers:

    Given limited research capacity, which campaign should receive attention next?

It is a recommendation layer, not an execution scheduler.

## Program snapshot

Each portfolio program is built from a verified ResearchCampaignTracker and the live campaign gate.

The portfolio records:

- program ID
- tracker fingerprint
- campaign plan fingerprint
- target claim revision
- current claim assessment
- campaign gate decision
- next planned step when eligible
- estimated next-step cost
- priority components
- priority score

## Eligibility

Only:

    READY_FOR_OPERATOR_SELECTION

campaigns are eligible.

Other campaign gates remain visible with explicit reasons, including waiting for results, waiting for evidence attachment, stale plans, contradictions, contested evidence, and completed plans.

Operator importance never overrides an ineligible campaign gate.

## Priority components

The default score is:

    0.30 * informationOpportunity
  + 0.25 * evidenceWeakness
  + 0.20 * replicationNeed
  + 0.15 * operatorImportance
  + 0.10 * costEfficiency

All components are normalized to [0,1].

### Information opportunity

Uses the next Rung 17 step's transparent Rung 16 stress score.

### Evidence weakness

Engineering mapping from current claim evidence grade:

    NO_EVIDENCE                  1.00
    PRELIMINARY_SUPPORT          0.90
    MULTI_SOURCE_SUPPORT         0.65
    REPLICATION_SUPPORT          0.40
    ROBUST_REPLICATION_CANDIDATE 0.10
    CONTESTED_EVIDENCE           1.00
    ADVERSE_EVIDENCE_ONLY        1.00

### Replication need

Uses the strongest replication grade already attached to the claim:

    none                          1.00
    SINGLE_REPLICATION_SUPPORT    0.80
    MULTI_REPLICATOR_SUPPORT      0.60
    CROSS_ENVIRONMENT_SUPPORT     0.30
    ROBUST_REPLICATION_CANDIDATE  0.05

### Operator importance

An explicit operator-supplied value in [0,1].

It is preference/mission priority, not empirical evidence.

### Cost efficiency

    1 - estimated next-step cost

The cost remains the Rung 16 engineering estimate, not measured dollars or runtime.

## Allocation

Eligible programs are sorted deterministically by priority score and tie-break fields.

The default strategy:

    PRIORITY_THEN_COST_FIT

walks the ranked list and recommends campaigns that fit:

- maxAllocatedCampaigns
- maxEstimatedCost

Programs that do not fit remain visible with an allocation reason.

## Duplicate protection

The portfolio rejects duplicate:

- program IDs
- tracker fingerprints
- campaign plan fingerprints

This prevents one campaign from appearing multiple times and consuming disproportionate portfolio budget.

## Authority boundary

The portfolio itself:

    selects nothing
    preregisters nothing
    executes nothing

An operator may issue a portfolio selection receipt for one allocated program.

That receipt says:

    campaignSelectionAuthorized = true
    experimentExecutionAuthorized = false

The selected campaign must still pass its own Rung 17 operator selection and Rung 15 execution/evidence boundaries.

## Scientific boundary

Portfolio priority is an engineering resource-allocation heuristic.

A high priority score does not mean a claim is likely true, important to science in general, or deserving of execution outside the declared operator context.
