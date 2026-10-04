# Governance

SIcologist separates observation, recommendation, and authority.

## Invariants
- The assessor cannot grant itself capabilities.
- A finding cannot directly trigger privileged execution.
- Operator-required interventions remain blocked until authorized.
- Adapters report execution failure rather than fabricating success.
- Recovery claims require post-intervention measurement.
- SIcologist is for software agents, not human medical diagnosis.

Every intervention plan emits `AUTO_ALLOWED`, `REQUIRES_OPERATOR`, or `REFUSE`.
