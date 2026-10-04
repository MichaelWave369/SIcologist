import {readFile,access} from "node:fs/promises";
import {CONDITION_CATALOG,SESSION_EVENT_TYPES} from "../src/index.js";

const required=[
  "README.md",
  "LICENSE",
  "docs/CONSTITUTION.md",
  "docs/ARCHITECTURE.md",
  "docs/FAILURE_TAXONOMY.md",
  "docs/GOVERNANCE.md",
  "docs/SESSION_OBSERVATORY.md",
  "schemas/observation.schema.json",
  "schemas/assessment.schema.json",
  "schemas/intervention.schema.json",
  "schemas/ledger-entry.schema.json",
  "schemas/session-event.schema.json",
  "schemas/session-report.schema.json",
  "fixtures/session-loop.json"
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

console.log("SIcologist repository contracts valid.");
