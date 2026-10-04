# Research Campaign Planner

## Purpose

Rung 17 converts Rung 16 challenge recommendations into a bounded, checkpointed research campaign.

A campaign is a plan for experiments, not permission to execute them.

## Inputs

Campaign creation requires:

- one current target claim revision
- one or more current rival claim revisions
- explicit condition and hypothesis bindings for each rival
- a max step count
- an estimated-cost budget
- optional Rung 16 stress weights and cost overrides per rival

The planner generates one Rung 16 stress report per rival.

## Selection strategy

The default strategy is:

    RIVAL_COVERAGE_THEN_GLOBAL_STRESS_SCORE

First, the planner considers each rival's strongest candidate. Those top candidates are ordered by stress score.

If step and budget capacity remain, the planner considers the remaining candidates globally by stress score.

A step is included only when its estimated cost fits inside the frozen budget.

Cost remains an engineering estimate, not measured money or runtime.

## Frozen campaign step

Every step records:

- source stress report fingerprint
- exact candidate ID
- rival claim and revision
- probe ID
- stress score
- expected information gain
- likelihood discrimination
- estimated cost

Every step also says:

    executionAuthorized = false
    operatorSelectionRequired = true
    checkpointRequiredAfterCompletion = true

## Campaign tracker

The tracker enforces a one-active-challenge-at-a-time progression.

Its gate decisions are:

    READY_FOR_OPERATOR_SELECTION
    WAIT_CHALLENGE_RESULT
    WAIT_RESULT_ATTACHMENT
    STOP_CHALLENGE_CONTRADICTED
    STOP_TARGET_SUPERSEDED
    STOP_PLAN_STALE
    ESCALATE_CONTESTED
    STOP_PLAN_COMPLETE
    STOP_NO_PLANNED_STEPS

## Checkpoint sequence

For each planned step:

    campaign gate
        |
        v
    operator selects exact step
        |
        v
    Rung 15 challenge is preregistered
        |
        v
    external execution/evidence collection
        |
        v
    Rung 15 result recorded
        |
        v
    result attached to Rung 14 claim
        |
        v
    fresh claim assessment
        |
        v
    next campaign gate

The tracker refuses to move from a resolved challenge to the next step until the challenge result is attached to the claim evidence graph.

## Stop rules

By default:

- a CONTRADICTED challenge result stops the campaign for reevaluation
- a superseded target claim stops the campaign
- a stale next rival revision stops the plan
- a CONTESTED target assessment escalates to operator review
- an unresolved challenge waits
- an unattached challenge result waits
- exhausting planned steps stops the campaign

## Authority boundary

The planner preregisters nothing.

The tracker can preregister one exact planned Rung 15 challenge only after explicit operator approval and a non-empty approval receipt.

Even the resulting campaign selection carries:

    executionAuthorized = false

No campaign function executes a probe or automatically selects a later step.

## Scientific boundary

The campaign optimizes research order under an engineering heuristic and estimated costs.

It does not establish that the chosen sequence is globally optimal, that the differential model is calibrated, or that completing the campaign proves the target claim.
