# Policy Constitution + Authority Domains

## Purpose

Rung 23 defines who may authorize which governance actions.

Earlier rungs deliberately separated recommendation from authority. Rung 23 separates authority itself.

The central rule remains:

    CAPABILITY != AUTHORITY

and adds:

    ROLE != AUTHORIZATION
    AUTHORIZATION != EXECUTION

## Declared principals

A constitution contains named principals.

Each principal has:

- principalId
- displayName
- ACTIVE or SUSPENDED status
- one or more authority domains

Identity assurance is explicitly:

    DECLARED_PRINCIPAL_ONLY

The runtime does not claim that a principal ID proves a human, legal, organizational, or cryptographic identity.

## Authority domains

Rung 23 defines:

    POLICY_PROPOSAL
    TRIAL_GOVERNANCE
    POLICY_REVIEW
    POLICY_ACTIVATION
    POLICY_ROLLBACK
    PORTFOLIO_WEIGHTS
    PORTFOLIO_BUDGET
    PORTFOLIO_SELECTION
    CAMPAIGN_SELECTION
    EXPERIMENT_EXECUTION
    CONSTITUTION_AMENDMENT

A principal can possess multiple domains, but action rules may still prevent that principal from serving multiple stages in the same lineage.

## Default action rules

### Policy revision

    PROPOSE_POLICY_REVISION
    domain: POLICY_PROPOSAL
    quorum: 1

### Trial approval

    APPROVE_POLICY_TRIAL
    domain: TRIAL_GOVERNANCE
    quorum: 1
    requires: PROPOSE_POLICY_REVISION
    separate from: PROPOSE_POLICY_REVISION

### Promotion review

    REVIEW_POLICY_PROMOTION
    domain: POLICY_REVIEW
    quorum: 2
    requires: APPROVE_POLICY_TRIAL
    separate from: PROPOSE_POLICY_REVISION

### Activation

    ACTIVATE_POLICY
    domain: POLICY_ACTIVATION
    quorum: 1
    requires: REVIEW_POLICY_PROMOTION
    separate from:
      PROPOSE_POLICY_REVISION
      REVIEW_POLICY_PROMOTION

### Rollback

    ROLLBACK_POLICY
    domain: POLICY_ROLLBACK
    quorum: 1
    requires: ACTIVATE_POLICY
    separate from: ACTIVATE_POLICY

## Resource-policy rules

Changing portfolio weights requires a two-principal PORTFOLIO_WEIGHTS quorum.

Changing portfolio budget requires a two-principal PORTFOLIO_BUDGET quorum.

These authorizations do not themselves modify a policy artifact.

## Operational authority chain

The default operational path is:

    SELECT_PORTFOLIO_PROGRAM
        ↓
    SELECT_CAMPAIGN_STEP
        ↓ different principal
    AUTHORIZE_EXPERIMENT_EXECUTION

Experiment authorization requires a prior campaign-selection authorization and separation from the principal who selected that campaign step.

The authorization receipt still does not execute the experiment.

## Constitutional authorization receipt

A successful authorization records:

- constitution ID, revision, and fingerprint
- action type
- exact subject fingerprint
- lineage key
- frozen rule
- approving principals
- hashed approval-receipt values
- required prior authorization fingerprints
- separation-of-duty evidence

It carries:

    actionAuthorized = true
    actionPerformed = false

## Quorum

A quorum counts distinct qualified principals.

Repeating the same principal does not increase quorum.

Every approving principal must be ACTIVE and hold every required domain for that action.

## Required prior actions

Some stages require evidence that earlier constitutional authorizations already exist in the same lineage.

For example, policy activation cannot be constitutionally authorized before a promotion review authorization exists.

## Separation of duty

A principal can possess multiple domains without being allowed to approve both sides of a separation rule.

For example, someone holding POLICY_PROPOSAL and TRIAL_GOVERNANCE still cannot both propose and approve the same policy lineage under the default constitution.

## Constitution amendments

A constitution amendment is a new constitution revision.

The proposal contains the entire proposed next constitution and points to the current constitution fingerprint.

Applying it requires:

    AMEND_CONSTITUTION
    domain: CONSTITUTION_AMENDMENT
    quorum: 2

under the old constitution.

The old constitution remains immutable.

## Rung 22 adapters

Rung 23 includes adapters for:

    activatePolicyPromotionConstitutionally
    rollbackActivePolicyConstitutionally

They verify the constitutional authorization receipt, then satisfy the existing Rung 22 operator gate using the authorization fingerprint as the approval receipt.

This preserves backward compatibility while strengthening the authority model.

## Boundary

Constitutional receipts prove that declared principal IDs satisfied software rules.

They do not prove who controlled those IDs in the physical world.

Cryptographic principal identity and external organizational identity remain future work.
