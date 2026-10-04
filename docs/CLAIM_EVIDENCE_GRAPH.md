# Claim Registry + Evidence Graph

## Purpose

Rung 14 connects SIcologist evidence artifacts to explicit propositions.

The registry answers a different question from the replication ladder:

    What exactly are we claiming,
    which evidence bears on that claim,
    and how has the claim changed over time?

## Immutable claim revisions

A claim has a stable claimKey and an immutable revision body containing:

- statement
- scope
- qualifiers
- claim type
- supersedes pointer

The claim ID is the SHA-256 fingerprint of that immutable body.

A changed proposition creates a new revision. The previous revision is marked SUPERSEDED and keeps its original evidence.

Evidence is not copied automatically to the new wording.

This prevents evidence collected for one statement from silently becoming evidence for a broader or different statement.

## Evidence relations

Evidence edges are explicit:

- SUPPORTS
- CONTRADICTS
- QUALIFIES
- CONTEXT

A single artifact cannot simultaneously SUPPORT and CONTRADICT the same claim revision. Mixed evidence should be represented as QUALIFIES or as separate artifacts with independently traceable provenance.

## Provenance

Evidence can be registered as:

    VERIFIED_ARTIFACT

when the full artifact is supplied and its internal fingerprint verifies, or:

    DECLARED_FINGERPRINT

when only a SHA-256 is supplied.

A declared fingerprint is useful provenance but is not treated as a verified artifact.

REPLICATION_SUMMARY evidence must be supplied as a verified artifact because its evidence grade is interpreted by the claim assessor.

## Claim assessment

Assessment status describes direction of evidence:

    UNASSESSED
    SUPPORT_ONLY
    CONTESTED
    CONTRADICTED
    SUPERSEDED

Evidence grade describes engineering support:

    NO_EVIDENCE
    PRELIMINARY_SUPPORT
    MULTI_SOURCE_SUPPORT
    REPLICATION_SUPPORT
    ROBUST_REPLICATION_CANDIDATE
    CONTESTED_EVIDENCE
    ADVERSE_EVIDENCE_ONLY

CONTESTED_EVIDENCE overrides support promotion whenever direct contradictory evidence exists.

## Evidence graph

The graph exports:

- claim nodes
- evidence nodes
- SUPPORTS edges
- CONTRADICTS edges
- QUALIFIES edges
- CONTEXT edges
- SUPERSEDES edges

The graph is deterministic and fingerprinted.

## Boundary

A strong evidence grade is not a truth label.

Every assessment retains:

    causalityEstablished = false
    scientificTruth = NOT_ESTABLISHED

Rung 14 records the state of evidence without turning the registry into an oracle.
