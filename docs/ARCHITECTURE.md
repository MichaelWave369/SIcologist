# Architecture

```text
Agent / Runtime
      |
      v
Session Observatory
      |
      +--------------------+
      |                    |
      v                    v
Universal Assessment   Longitudinal Profile
      |                    |
      +---------+----------+
                |
                v
        Differential Engine
                |
                v
        Blind Case Conference
      +---------+----------+
      |                    |
      v                    v
Consensus / Disagreement  Minority Preservation
      |                    |
      +---------+----------+
                |
                v
        Information-Gain Probe
                |
                v
        Governed Intervention
                |
                v
        Recovery Measurement
                |
                v
          Case / History
```

## Rung 7 boundary

A conference is an aggregation of independent software-agent reviews.

It must not convert agreement into truth.

```text
consensus != correctness
minority != error
convergence != validation
discussion != evidence
reviewer count != certainty
```

## Blind-first protocol

1. Create a conference for one case and one condition.
2. Reviewers submit first-pass differential snapshots independently.
3. During the BLIND phase, the public conference view exposes receipts only.
4. Seal the blind round.
5. Compute aggregate agreement, disagreement, minority hypotheses, and evidence overlap.
6. Enter REVIEW phase.
7. Reviewers may submit one revised differential after peer review.
8. Close the conference.
9. Compare blind versus final disagreement to measure convergence or divergence.
10. Record the closed conference report into the case ledger.

## Review roles

The default six roles are intentionally different lenses, not authority tiers:

- OBSERVER
- VERIFIER
- CHALLENGER
- HISTORIAN
- INTERVENTION_SPECIALIST
- GOVERNANCE_AUDITOR

A role does not grant capabilities.

## Conference metrics

- **consensus distribution**: mean normalized hypothesis weight across reviewers
- **top agreement**: fraction of reviewers whose top-ranked hypothesis matches the modal top hypothesis
- **pairwise disagreement**: mean total-variation distance between reviewer distributions
- **consensus strength**: `1 - pairwiseDisagreement`
- **minority hypotheses**: hypotheses selected as top choice by at least one reviewer but not the modal top choice
- **evidence overlap**: mean Jaccard similarity over reviewer evidence-reference sets
- **convergence delta**: blind disagreement minus final disagreement
- **group shift**: total-variation distance between blind and final consensus distributions
