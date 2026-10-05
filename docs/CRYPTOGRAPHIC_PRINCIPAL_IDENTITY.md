# Cryptographic Principal Identity + Key Lifecycle

## Purpose

Rung 24 strengthens Rung 23 from declared principal IDs to verifiable Ed25519 key possession.

It answers:

    Did the holder of a registered principal key sign this exact approval payload?

It does not answer:

    Which legal person controlled that key?
    Was the signer physically present?
    Was the signing time externally trusted?
    Was the principal-to-key bootstrap independently audited?

Those remain separate identity and custody questions.

## Principal key registry

The registry is tied to one exact Rung 23 constitution fingerprint.

It is append-only and event-sourced.

Every event has:

- sequence number
- registry ID
- constitution fingerprint
- previous event fingerprint
- event fingerprint

Key generations must increase contiguously for each principal.

## Enrollment

Enrollment requires:

- an ACTIVE constitutional principal
- unique key ID
- Ed25519 public key
- matching private-key proof of possession
- non-empty external bootstrap receipt

The bootstrap receipt is stored only as a fingerprint.

The registry proves that the supplied private key matches the enrolled public key.

It does not independently prove that the external bootstrap process correctly identified the principal.

## Rotation

Rotation requires:

- old key currently ACTIVE
- unique replacement key ID
- old private-key signature over the exact rotation payload
- new private-key proof over that same payload
- reason

After rotation:

    old key = RETIRED
    new key = ACTIVE

Historical signatures from the old key remain cryptographically verifiable.

## Revocation

Ordinary revocation requires another distinct ACTIVE key belonging to the same principal.

The authorizer key signs the exact revocation payload.

A key cannot revoke itself through this path.

This intentionally means a single lost key cannot be cryptographically self-revoked.

## Recovery

Lost-key recovery uses a separate path requiring:

- external recovery receipt
- reason
- replacement public key
- replacement proof of possession

Recovery revokes all currently active keys for that principal and installs the new key.

It records:

    recoveryAssurance = EXTERNAL_RECOVERY_RECEIPT_ONLY

The runtime does not pretend this is cryptographic continuity from the lost key.

## Signed principal approval

A signed approval freezes:

    registry ID
    registry sequence
    registry fingerprint
    constitution fingerprint
    principal ID
    key ID
    key generation
    public-key fingerprint
    action type
    subject fingerprint
    lineage key

Identity assurance:

    PUBLIC_KEY_POSSESSION

The Ed25519 signature covers the canonical form of that entire payload.

## Snapshot freshness

For a new privileged action, signed approvals must match the current registry snapshot.

Any key-registry event makes earlier pending approvals stale for execution.

This is conservative by design.

It prevents a revoked or rotated key from manufacturing a new current authorization by claiming an earlier registry state.

## Historical verification

Historical audit verification may validate an old approval against the exact registry snapshot in which its key was ACTIVE.

That establishes:

    signature valid for registered historical key

It does not establish trusted signing time.

A compromised retired key could theoretically produce a signature that claims an earlier registry sequence if no separately anchored receipt proves when the signature entered the system.

Therefore historical verification is audit evidence, not authority for a new action.

## Cryptographic constitutional authorization

authorizeCryptographically first verifies every signed approval against the current key registry.

It then passes those verified principals into the existing Rung 23 constitutional ledger.

The resulting attestation binds:

    Rung 23 constitutional receipt
    signed principal approvals
    exact key-registry snapshot

and records:

    actionAuthorized = true
    actionPerformed = false
    identityAssurance = PUBLIC_KEY_POSSESSION

## Lifecycle adapters

Rung 24 adds:

    activatePolicyPromotionCryptographically
    rollbackActivePolicyCryptographically

These require a cryptographic authorization attestation that is still current against the key registry.

Historical attestations remain verifiable for audit, but cannot perform a new privileged action after registry state changes.

## Boundary

Ed25519 verification proves possession of the corresponding private key.

It does not prove legal identity, organizational independence, physical presence, intent, or informed consent.

Key custody, hardware-backed signing, trusted timestamps, and external identity attestation remain outside Rung 24.
