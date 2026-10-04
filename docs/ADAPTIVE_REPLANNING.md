# Campaign Outcomes + Adaptive Replanning

## Purpose

Rung 18 lets SIcologist respond to new campaign evidence while preserving the complete history of the plan that existed before that evidence arrived.

Adaptive replanning creates a new campaign artifact. It never edits the prior campaign.

## Checkpoint requirement

A selected Rung 17 challenge must be fully checkpointed before it can trigger adaptation:

1. the Rung 15 challenge has a result
2. the result is attached to the Rung 14 target claim evidence graph

If either step is missing, adaptive replanning is rejected.

## Claim revision rebinding

Campaign plans bind exact claim revisions.

During adaptation SIcologist resolves the latest claim with the same stable claimKey for:

- the target claim
- every non-retired rival claim

If a claim was revised, the adaptive revision records the old and new claim IDs and revision numbers.

The new campaign is generated against the latest revision.

The old campaign remains bound to the historical revision.

## Completed candidate retirement

By default, every completed pair:

    rival claim key + probe ID

is added to the new campaign's exclusions.

This prevents a replan from immediately proposing the exact experiment that just finished.

Retesting can be enabled explicitly with:

    allowRetestCompleted = true

That override is recorded in the adaptive revision.

## Rival retirement

An operator may explicitly retire rival claim keys from the adaptive campaign input.

Retirement means the rival is omitted from the new planning set. It does not mean that the rival was disproven.

## Assessment transition

Each revision records:

- prior target claim ID
- prior assessment fingerprint
- prior status and evidence grade
- current target claim ID
- current assessment fingerprint
- current status and evidence grade

This makes the evidence state that motivated replanning auditable.

## Plan diff

The adaptive artifact compares the old unexecuted remainder with the newly generated plan and records:

- carried-forward experiment identities
- newly added experiment identities
- old remaining experiments retired by the new plan

Experiment identity for this diff is:

    rival claim key + probe ID

## Activation boundary

Creating an adaptive revision does not activate it.

Activation requires:

    operatorApproved = true
    non-empty approvalReceipt

Activation returns:

- a fingerprinted activation receipt
- a fresh Rung 17 ResearchCampaignTracker for the new plan

The activation receipt retains:

    executionAuthorized = false

The operator has approved the new planning revision, not execution of its experiments.

## Review recommendation

If the current target claim is CONTESTED or CONTRADICTED, the revision records:

    reviewRecommended = true

The revision can still be generated for inspection, but it does not self-authorize continuation.

## Lineage

Revision 2 points to the original plan.

Later revisions also point to the preceding adaptive revision.

A valid lineage requires:

- one shared root plan fingerprint
- monotonically increasing revision numbers
- each revision's supersedesRevisionFingerprint to match the preceding revision

## Boundary

Adaptive replanning is a research-order heuristic.

It does not establish that the new plan is globally optimal, that a contradicted claim should continue to be studied, or that any campaign outcome establishes scientific truth.
