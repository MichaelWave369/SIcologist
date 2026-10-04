import {readFile,access} from "node:fs/promises";
import {CONDITION_CATALOG,PROBE_CATALOG,SESSION_EVENT_TYPES,validateProbeCatalog} from "../src/index.js";

const required=[
  "README.md",
  "LICENSE",
  "docs/CONSTITUTION.md",
  "docs/ARCHITECTURE.md",
  "docs/FAILURE_TAXONOMY.md",
  "docs/GOVERNANCE.md",
  "docs/SESSION_OBSERVATORY.md",
  "docs/EXPERIMENTAL_PROBES.md",
  "docs/PHI_INTERFEROMETER.md",
  "schemas/observation.schema.json",
  "schemas/assessment.schema.json",
  "schemas/intervention.schema.json",
  "schemas/ledger-entry.schema.json",
  "schemas/session-event.schema.json",
  "schemas/session-report.schema.json",
  "schemas/experiment-plan.schema.json",
  "schemas/probe-result.schema.json",
  "schemas/interferometer-result.schema.json",
  "fixtures/session-loop.json",
  "fixtures/probe-experiment.json"
];

for(const f of required) await access(f);
for(const f of required.filter(f=>f.endsWith(".json"))) JSON.parse(await readFile(f,"utf8"));

if(CONDITION_CATALOG.length!==12) throw new Error(`Expected 12 conditions, got ${CONDITION_CATALOG.length}`);
if(new Set(CONDITION_CATALOG.map(c=>c.id)).size!==12) throw new Error("Condition IDs must be unique");

for(const c of CONDITION_CATALOG){
  for(const k of ["rules","alternatives","probes","interventions"]){
    if(!c[k]?.length) throw new Error(`${c.id} missing ${k}`);
  }
}

if(SESSION_EVENT_TYPES.length!==12) throw new Error(`Expected 12 session event types, got ${SESSION_EVENT_TYPES.length}`);
if(new Set(SESSION_EVENT_TYPES).size!==SESSION_EVENT_TYPES.length) throw new Error("Session event types must be unique");

if(new Set(PROBE_CATALOG.map(p=>p.id)).size!==PROBE_CATALOG.length) throw new Error("Probe IDs must be unique");
const missing=validateProbeCatalog();
if(missing.length) throw new Error(`Missing probe catalog entries: ${JSON.stringify(missing)}`);

console.log("SIcologist repository contracts valid.");
