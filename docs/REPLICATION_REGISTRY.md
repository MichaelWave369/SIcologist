# Replication Registry + Evidence Ladder

## Purpose

Rung 13 aggregates replication receipts produced under one frozen Rung 12 protocol.

The registry is deliberately conservative. It distinguishes receipt count, unique observed evidence, declared replicator count, comparable runs, supportive replications, divergences, and incomparable failures.

## Evidence reuse

The same observed evaluation receipt can be wrapped in multiple replication receipts.

Rung 13 detects this through observedReceiptFingerprint and counts that observed evidence once for ladder promotion.

This prevents copied evidence from masquerading as repeated replication.

## Declared replicators

Replicator IDs are declarations, not verified legal or institutional identities.

Multiple runs from one replicator can demonstrate repeatability, but they do not increase supportReplicatorCount beyond one.

The evidence boundary therefore retains:

    replicatorIdentity = DECLARED_NOT_VERIFIED
    replicationIndependence = NOT_ESTABLISHED

## Comparable evidence

Comparable statuses are:

    REPLAY_EXACT
    REPLICATION_WITHIN_TOLERANCE
    REPLICATION_DIVERGED

Supportive statuses are:

    REPLAY_EXACT
    REPLICATION_WITHIN_TOLERANCE

Artifact mismatches, environment mismatches, and insufficient-evidence runs remain visible as adverse evidence but are not treated as direct replication successes or divergences.

## Default evidence ladder

### NO_REPLICATION_EVIDENCE

No unique supportive replication exists.

### SINGLE_REPLICATION_SUPPORT

At least one unique supportive replication exists.

### MULTI_REPLICATOR_SUPPORT

At least 2 declared supportive replicators and support rate >= 0.67.

### CROSS_ENVIRONMENT_SUPPORT

At least 3 declared supportive replicators, at least 2 supportive environment families, and support rate >= 0.75.

### ROBUST_REPLICATION_CANDIDATE

At least 4 declared supportive replicators, at least 3 supportive environment families, at least 5 comparable unique evidence units, support rate >= 0.80, and divergence rate <= 0.20.

These thresholds are engineering policy defaults. They are not universal scientific constants.

## Heterogeneity

For comparable runs the registry reports the mean, minimum, and maximum absolute delta for accuracy, multiclass Brier score, log loss, and expected calibration error.

It also reports mean, minimum, and maximum top-prediction agreement.

## Failures remain evidence

Diverged, mismatched, and insufficient runs are retained in adverseEvidence.

They are not deleted when a higher evidence grade is reached.

## Boundary

ROBUST_REPLICATION_CANDIDATE is an engineering evidence grade.

It does not establish causality, generalization, institutional independence, or scientific truth.
