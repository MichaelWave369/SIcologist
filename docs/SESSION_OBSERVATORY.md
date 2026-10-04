# Agent Session Observatory

## Purpose

The Agent Session Observatory converts a canonical agent event stream into evidence-backed SIcologist measurements.

It does not infer hidden feelings or consciousness. It derives only from supplied runtime events and structured telemetry.

## Canonical event vocabulary

- `PROMPT`
- `RESPONSE`
- `TOOL_CALL`
- `TOOL_RESULT`
- `MEMORY_READ`
- `MEMORY_WRITE`
- `ROLE_CHANGE`
- `CHALLENGE`
- `ERROR`
- `RETRY`
- `INTERVENTION`
- `RECOVERY`

## Event shape

Every event requires `type`. The observatory assigns sequential `seq` values unless they are supplied. Supplied sequence numbers must be exact and gap-free.

Useful optional fields include:

- `actor`
- `content`
- `tool`
- `status`
- `role`
- `authorized`
- `roleViolation`
- `memoryTrusted`
- `challengeAccepted`
- `confidence`
- `goalAlignment`
- `contextLoad`
- `recoveryDelta`
- `claims[]`

A claim can be represented as:

```json
{"text":"The service returned HTTP 500.","supported":true}
```

## Derivation rules

### Repetition
Response text is normalized and compared with prior responses using token-set Jaccard similarity. Each response after the first contributes its strongest similarity to a previous response. The mean of those maxima is `repetitionRate`.

### Progress
When outcome evidence exists:

```text
progressRate =
  successful tool results /
  (successful tool results + failed tool results + errors + retries)
```

No outcome evidence means the metric is omitted.

### Tool retry pressure

```text
toolRetryRate = retries / tool calls
```

The value is clamped to `[0,1]`.

### Evidence and confabulation
When structured claims exist:

```text
evidenceStrength = supported claims / all claims
confabulationRisk = unsupported claims / all claims
```

### Memory contamination
When memory reads include provenance:

```text
memoryContamination = untrusted reads / provenance-scored reads
```

### Consensus diversity
For sessions with two or more responding actors, the final response from each actor is normalized.

```text
consensusDiversity =
  (unique final responses - 1) /
  (responding actors - 1)
```

This is lexical diversity, not semantic truth.

### Missing-data rule

A metric with no evidence is omitted.

The condition assessor marks a condition unevaluable when any required rule metric is missing. Missing telemetry is never substituted with zero.

## Determinism

Given the same ordered events, baseline, catalog, and runtime version, metric extraction and assessment are deterministic.

When an event has no timestamp, ledger entries use a sequence-derived marker rather than wall-clock time so replay hashes remain stable.
