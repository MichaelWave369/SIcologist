# Reproducibility + External Replication Protocol

## Goal

Rung 12 turns a successful evaluation into a frozen replication target that another machine, operator, or laboratory can rerun.

## Frozen replication contract

The protocol binds the reference run to the challenge fingerprint, evaluation-set fingerprint, label commitment, model artifact SHA-256, source commit, dependency fingerprint, seed schedule, reference environment, required environment fields, and metric tolerances.

Changing a frozen artifact is not replication drift. It is an ARTIFACT_MISMATCH.

## Environment drift

Environment metadata includes OS, architecture, runtime family, runtime version, hardware class, and an optional container fingerprint.

Only fields declared in environmentPolicy.requiredExact are gating requirements. Other differences are retained as environment drift.

This allows meaningful cross-platform replication instead of demanding that every laboratory own the same motherboard, a research standard humanity somehow nearly invented by accident.

## Comparison

The replication receipt compares the new independent evaluation receipt against the frozen reference using absolute metric deltas, top-prediction agreement, prediction commitment equality, artifact equality, and declared environment requirements.

## Status semantics

REPLAY_EXACT means the prediction commitment matches, all tracked metric deltas are zero, and top predictions agree for every case.

REPLICATION_WITHIN_TOLERANCE means artifacts and required environment fields match, top-prediction agreement meets the frozen threshold, and every tracked metric delta is within tolerance.

REPLICATION_DIVERGED means the run is comparable but exceeds one or more frozen tolerances.

ENVIRONMENT_MISMATCH means a field explicitly required to match differs.

ARTIFACT_MISMATCH means a frozen challenge, model artifact, source commit, dependency fingerprint, evaluation binding, label commitment, or seed schedule differs.

INSUFFICIENT_REPLICATION_EVIDENCE means integrity or coverage is inadequate for comparison.

## Scientific boundary

A replication receipt proves what artifacts were declared and whether two software runs agree under the implemented checks.

It does not establish that a replicator is institutionally independent, that a dataset is representative, or that a reproduced result generalizes beyond the tested system.
