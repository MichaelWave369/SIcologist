# Case Conference / Multi-Agent Differential Review

## Why

A single differential engine can be internally consistent and still be wrong.

Rung 7 therefore supports multiple independent reviewers examining the same condition before they see one another's conclusions.

The goal is not voting.

The goal is to expose:

- shared assumptions
- independent agreement
- disagreement
- minority hypotheses
- evidence duplication
- evidence independence
- review-induced convergence
- review-induced herding

## Blind round

Each reviewer submits:

```json
{
  "reviewerId": "reviewer-a",
  "role": "VERIFIER",
  "differential": { "...": "Rung 6 snapshot" },
  "evidenceRefs": ["tool-log:17", "fixture:known-good"]
}
```

During the blind phase, callers receive only a receipt containing the reviewer, role, and a submission fingerprint.

Peer rankings are not exposed until the round is sealed.

This is an API/protocol boundary, not a cryptographic isolation guarantee. A host application that directly leaks reviewer inputs can still ruin independence, because software remains stubbornly unable to prevent its operator from doing something silly.

## Aggregate

After sealing, the conference reports:

- consensus hypothesis weights
- modal top hypothesis
- top-choice agreement
- pairwise disagreement
- consensus strength
- minority top hypotheses
- mean evidence overlap
- shared evidence refs
- unique evidence-ref counts per reviewer

All outputs carry:

```text
epistemicStatus = CONSENSUS_IS_NOT_TRUTH
explanationStatus = NOT_ESTABLISHED
```

## Review round

After blind results are exposed, original reviewers may submit one revised differential.

The conference closes using each reviewer's revision when present, otherwise their blind submission.

The final report compares blind and final states.

```text
convergenceDelta > 0  => reviewers moved closer together
convergenceDelta < 0  => reviewers moved farther apart
```

Neither result indicates correctness.

## Minority preservation

A hypothesis is marked as a minority hypothesis when at least one reviewer ranks it first but it is not the modal top hypothesis.

This ensures a majority cannot make dissent disappear from the record.

## Evidence overlap

Reviewer evidence references are treated as opaque identifiers.

The conference measures Jaccard overlap between reviewers' reference sets. High agreement with identical evidence is different from high agreement built from largely independent evidence.

Rung 7 records that difference rather than pretending all consensus has the same informational value.
