import {readFile,access} from "node:fs/promises";
import {
  CASE_EVENT_TYPES,
  CONDITION_CATALOG,
  PROBE_CATALOG,
  SESSION_EVENT_TYPES,
  profileScopes,
  validateProbeCatalog
} from "../src/index.js";

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
  "docs/LONGITUDINAL_PROFILES.md",
  "docs/CASE_FILES.md",
  "schemas/observation.schema.json",
  "schemas/assessment.schema.json",
  "schemas/intervention.schema.json",
  "schemas/ledger-entry.schema.json",
  "schemas/session-event.schema.json",
  "schemas/session-report.schema.json",
  "schemas/experiment-plan.schema.json",
  "schemas/probe-result.schema.json",
  "schemas/interferometer-result.schema.json",
  "schemas/profile-context.schema.json",
  "schemas/longitudinal-profile.schema.json",
  "schemas/profile-comparison.schema.json",
  "schemas/case-event.schema.json",
  "schemas/case-file.schema.json",
  "schemas/intervention-history.schema.json",
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

const scopes=profileScopes({
  agentId:"validator",
  modelId:"model",
  role:"builder",
  taskClass:"repair",
  runtime:"local"
});
if(scopes.length!==4) throw new Error(`Expected 4 profile scopes, got ${scopes.length}`);
if(new Set(scopes.map(scope=>scope.key)).size!==4) throw new Error("Profile scope keys must be unique");

if(CASE_EVENT_TYPES.length!==10) throw new Error(`Expected 10 case event types, got ${CASE_EVENT_TYPES.length}`);
if(new Set(CASE_EVENT_TYPES).size!==CASE_EVENT_TYPES.length) throw new Error("Case event types must be unique");

console.log("SIcologist repository contracts valid.");
