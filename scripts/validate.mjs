import {readFile,access} from "node:fs/promises";
import {
  CASE_CONFERENCE_ROLES,
  CASE_EVENT_TYPES,
  CONDITION_CATALOG,
  DIFFERENTIAL_CATALOG,
  FROZEN_BENCHMARK_COUNTS,
  FROZEN_BENCHMARK_FINGERPRINT,
  PROBE_CATALOG,
  SESSION_EVENT_TYPES,
  generateFrozenSyntheticBenchmark,
  profileScopes,
  validateDifferentialCatalog,
  validateFrozenSyntheticBenchmark,
  validateProbeCatalog,
  DATASET_USES,
  CANDIDATE_STATUSES
} from "../src/index.js";

const required=[
  "README.md","LICENSE",
  "docs/CONSTITUTION.md","docs/ARCHITECTURE.md","docs/FAILURE_TAXONOMY.md","docs/GOVERNANCE.md",
  "docs/SESSION_OBSERVATORY.md","docs/EXPERIMENTAL_PROBES.md","docs/PHI_INTERFEROMETER.md",
  "docs/LONGITUDINAL_PROFILES.md","docs/CASE_FILES.md","docs/DIFFERENTIAL_HYPOTHESES.md",
  "docs/CASE_CONFERENCE.md","docs/CALIBRATION_BENCHMARK.md","docs/REAL_CASE_INTAKE.md",
  "schemas/observation.schema.json","schemas/assessment.schema.json","schemas/intervention.schema.json",
  "schemas/ledger-entry.schema.json","schemas/session-event.schema.json","schemas/session-report.schema.json",
  "schemas/experiment-plan.schema.json","schemas/probe-result.schema.json","schemas/interferometer-result.schema.json",
  "schemas/profile-context.schema.json","schemas/longitudinal-profile.schema.json","schemas/profile-comparison.schema.json",
  "schemas/case-event.schema.json","schemas/case-file.schema.json","schemas/intervention-history.schema.json",
  "schemas/differential-snapshot.schema.json","schemas/differential-evidence.schema.json",
  "schemas/conference-review.schema.json","schemas/conference-report.schema.json",
  "schemas/empirical-model.schema.json","schemas/benchmark-report.schema.json",
  "schemas/real-case-candidate.schema.json","schemas/real-case-dataset.schema.json",
  "fixtures/session-loop.json","fixtures/probe-experiment.json","fixtures/benchmark-v0.1-manifest.json"
];

for(const f of required) await access(f);
for(const f of required.filter(f=>f.endsWith(".json"))) JSON.parse(await readFile(f,"utf8"));

if(CONDITION_CATALOG.length!==12) throw new Error("Expected 12 conditions");
if(new Set(CONDITION_CATALOG.map(c=>c.id)).size!==12) throw new Error("Condition IDs must be unique");
for(const c of CONDITION_CATALOG){
  for(const k of ["rules","alternatives","probes","interventions"]){
    if(!c[k]?.length) throw new Error(c.id+" missing "+k);
  }
}

if(SESSION_EVENT_TYPES.length!==12) throw new Error("Expected 12 session event types");
if(new Set(PROBE_CATALOG.map(p=>p.id)).size!==PROBE_CATALOG.length) throw new Error("Probe IDs must be unique");
const missing=validateProbeCatalog();
if(missing.length) throw new Error("Missing probe catalog entries: "+JSON.stringify(missing));

const scopes=profileScopes({agentId:"validator",modelId:"model",role:"builder",taskClass:"repair",runtime:"local"});
if(scopes.length!==4) throw new Error("Expected 4 profile scopes");

if(CASE_EVENT_TYPES.length!==12) throw new Error("Expected 12 case event types");
if(CASE_CONFERENCE_ROLES.length!==6) throw new Error("Expected 6 conference roles");

if(DIFFERENTIAL_CATALOG.length!==CONDITION_CATALOG.length) throw new Error("Differential catalog must cover every condition");
const differentialErrors=validateDifferentialCatalog();
if(differentialErrors.length) throw new Error("Differential catalog errors: "+JSON.stringify(differentialErrors));

const dataset=generateFrozenSyntheticBenchmark();
const benchmarkErrors=validateFrozenSyntheticBenchmark(dataset);
if(benchmarkErrors.length) throw new Error("Frozen benchmark errors: "+benchmarkErrors.join(", "));
if(dataset.fingerprint!==FROZEN_BENCHMARK_FINGERPRINT) throw new Error("Frozen benchmark fingerprint changed");
if(dataset.cases.length!==FROZEN_BENCHMARK_COUNTS.cases) throw new Error("Frozen benchmark case count changed");

if(DATASET_USES.length!==2) throw new Error("Expected 2 dataset uses");
if(CANDIDATE_STATUSES.length!==5) throw new Error("Expected 5 candidate statuses");

const manifest=JSON.parse(await readFile("fixtures/benchmark-v0.1-manifest.json","utf8"));
if(manifest.fingerprint!==dataset.fingerprint) throw new Error("Benchmark manifest fingerprint mismatch");

console.log("SIcologist repository contracts valid.");
