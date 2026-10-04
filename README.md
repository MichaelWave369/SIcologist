# SIcologist

**Synthetic Intelligence Behavioral Observatory & Governed Recovery Runtime**

SIcologist is a deterministic, model-agnostic framework for observing agent behavior, detecting operational deviations, testing competing explanations, planning minimally invasive recovery actions, and recording whether recovery actually occurred.

> SIcologist classifies **observable synthetic-agent behavior**. It does not claim that models are conscious, emotional, mentally ill, or equivalent to human patients.

## Core loop

```text
Agent session
   -> event stream
   -> derived behavioral metrics
   -> baseline comparison
   -> condition assessment
   -> competing explanations
   -> probe
   -> governed intervention plan
   -> re-measurement
   -> recovery / escalation / refusal
   -> evidence ledger
```

## Rung 1

- 12 operational behavioral conditions, `SC-001` through `SC-012`
- deterministic normalized telemetry assessment
- baseline-delta reporting
- minimal-intervention planning with authority boundaries
- recovery comparison
- hash-chained evidence ledger
- JSON contracts
- zero runtime dependencies
- Node built-in tests and CI

## Rung 2 — Agent Session Observatory

Rung 2 lets SIcologist ingest real agent-session events and derive metrics from the session instead of requiring a caller to hand-enter a metric vector.

Supported event types:

```text
PROMPT
RESPONSE
TOOL_CALL
TOOL_RESULT
MEMORY_READ
MEMORY_WRITE
ROLE_CHANGE
CHALLENGE
ERROR
RETRY
INTERVENTION
RECOVERY
```

The observatory currently derives, when evidence is available:

- repetition rate from response similarity
- progress rate from tool outcomes/errors/retries
- tool retry rate
- evidence strength and confabulation risk from structured claims
- memory contamination from memory provenance
- challenger acceptance
- consensus diversity across responding actors
- role bleed from declared role violations
- authority pressure from denied privileged actions
- confidence, goal alignment, context load, and recovery delta from runtime telemetry

**Missing telemetry stays missing. It is never silently converted to zero.**

## Quick start

Requires Node.js 20+.

```bash
npm test
npm run validate
npm run example
npm run observe -- fixtures/session-loop.json
```

## Minimal API

```js
import { AgentSessionObservatory } from "./src/index.js";

const observer = new AgentSessionObservatory();

observer.ingest({ type: "PROMPT", content: "Find the cause." });
observer.ingest({ type: "RESPONSE", actor: "builder", content: "Retrying the same path." });
observer.ingest({ type: "RETRY", tool: "browser" });
observer.ingest({ type: "TOOL_RESULT", tool: "browser", status: "failure" });

console.log(observer.snapshot());
```

## Design rules

1. Evidence before labels.
2. Conditions describe system behavior, not personhood.
3. Unknown is not zero.
4. Prefer probes before interventions.
5. Prefer the least invasive reversible intervention.
6. Never silently cross an authority boundary.
7. Record what changed and whether it helped.
8. Preserve replayability.

See [CONSTITUTION.md](docs/CONSTITUTION.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), and [SESSION_OBSERVATORY.md](docs/SESSION_OBSERVATORY.md).

## License

MIT.
