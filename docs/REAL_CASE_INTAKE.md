# Real-Case Evidence Intake + Dataset Builder

## Purpose

Rung 9 creates a governed bridge between operational SIcologist case files and future research datasets.

A real incident is not automatically a trustworthy labeled example. The intake pipeline separates incident, candidate, blind adjudication, adjudicated reference label, operator approval, and dataset export.

## Source gate

A candidate can only be created from a CLOSED case whose ledgerValid field is true and whose target condition is declared by SIcologist.

The candidate stores fingerprints and opaque references rather than copying the full case chronology into the research dataset.

## Dataset-use assignment

At intake a candidate receives exactly one immutable use: TRAIN_CANDIDATE or EVAL_QUARANTINE.

Evaluation-quarantine exports carry split=EVAL_QUARANTINE and neverTrain=true. The empirical fitter rejects evaluation-quarantine datasets.

## Lineage split-lock

Every candidate requires a lineage key identifying the originating incident family. The registry hashes it and prevents the same lineage from appearing on opposite sides of training and evaluation.

This catches the classic leakage trick where an incident replay gets a new filename and is suddenly declared independent evidence. Humans remain creative in all the wrong directions.

## Evidence split-lock

Opaque evidence references are registered by dataset use. A reference already associated with training cannot later appear in evaluation quarantine, and vice versa.

## Blind adjudication

Reviewers independently submit reviewer ID, one declared hypothesis ID, confidence in [0,1], evidence references, and an optional note.

Before sealing, the public candidate snapshot exposes receipts only. Peer labels and evidence references remain hidden.

The default policy requires at least two reviewers and unanimous agreement. A failed threshold produces DISPUTED and blocks approval.

## Label semantics

An accepted label is ADJUDICATED_REFERENCE, not GROUND_TRUTH.

## Promotion

A candidate can become APPROVED only when adjudication passed, every declared probe has a POSITIVE or NEGATIVE outcome, operator approval is explicit, and a non-empty approval receipt is supplied.

## Dataset export

Training exports use split=TRAIN and neverTrain=false. Evaluation exports use split=EVAL_QUARANTINE and neverTrain=true. Both preserve labelStatus=ADJUDICATED_REFERENCE and are fingerprinted.

## Scientific boundary

Rung 9 improves provenance and leakage control. It does not establish that an adjudicated reference label is objectively correct, that reviewers are independent in the real world, or that an approved case is representative of deployment conditions.
