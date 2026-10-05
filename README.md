# SIcologist

**Synthetic Intelligence Behavioral Observatory, Experimental Probe & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing software-agent behavior, testing competing explanations, governing interventions, measuring recovery, and preserving replayable evidence.

> SIcologist classifies observable synthetic-agent behavior. It does not claim consciousness, emotion, psychiatric illness, or human-equivalent subjective experience.

## Rungs

1. Behavioral core
2. Agent Session Observatory
3. Experimental Probe Engine + software-only Phi Interferometer
4. Longitudinal Agent Profiles
5. Case Files + Intervention History
6. Differential Hypothesis Engine
7. Blind Case Conference
8. Calibration + Benchmark Lab
9. Real-Case Evidence Intake + Dataset Builder
10. Sealed External Evaluation Harness
11. Independent Evaluator Package + Custody Split
12. Reproducibility + External Replication Protocol
13. Replication Registry + Evidence Ladder
14. Claim Registry + Evidence Graph
15. Falsification + Claim Challenge Engine
16. Claim Stress Lab + Adversarial Challenge Generator
17. Research Campaign Planner
18. Campaign Outcomes + Adaptive Replanning
19. Research Program Portfolio + Resource Allocation
20. Portfolio Outcomes + Program Governance
21. Policy Revision + Prospective A/B Governance
22. Policy Promotion + Rollback Governance
23. Policy Constitution + Authority Domains
24. Cryptographic Principal Identity + Key Lifecycle

## Rung 24

Rung 24 adds Ed25519 key possession to the Rung 23 constitutional authority model.

A principal-key registry is event-sourced:

    ENROLL
      |
      +--> ROTATE
      |
      +--> REVOKE
      |
      +--> RECOVER

Enrollment proves possession of the new private key and records an external bootstrap-receipt fingerprint.

Rotation requires both:

    old active key signature
    new key proof of possession

Ordinary revocation requires a different active key belonging to the same principal.

Lost-key recovery is explicitly weaker:

    recoveryAssurance = EXTERNAL_RECOVERY_RECEIPT_ONLY

Recovery revokes all active keys for that principal and proves possession of the replacement key.

Signed constitutional approvals bind the exact:

    registry snapshot
    constitution fingerprint
    principal + key generation
    action type
    subject fingerprint
    lineage key

A cryptographic authorization attestation wraps the Rung 23 constitutional receipt and raises identity assurance to:

    PUBLIC_KEY_POSSESSION

It still does not establish legal identity, physical human identity, or a trusted timestamp.

Historical signatures remain auditable after rotation/revocation. Privileged actions require the current key-registry snapshot, so stale or revoked approvals cannot be used to activate or rollback policy.

## Quick start

    npm test
    npm run validate
    npm run identity

## License

MIT.
