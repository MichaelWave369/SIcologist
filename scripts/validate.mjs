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
  CANDIDATE_STATUSES,
  SealedEvaluationHarness,
  verifyEvaluationReceipt,
  predictEvaluationManifest,
  createIndependentCustodySplit,
  createIndependentSubmission,
  scoreIndependentSubmission,
  signIndependentEvaluationReceipt,
  verifyIndependentEvaluationReceipt,
  predictIndependentChallenge,
  verifyEvaluatorSignature,
  REPLICATION_STATUSES,
  createReplicationProtocol,
  createReplicationReceipt,
  verifyReplicationProtocol,
  verifyReplicationReceipt,
  REPLICATION_EVIDENCE_GRADES,
  DEFAULT_EVIDENCE_LADDER_POLICY,
  ReplicationEvidenceRegistry,
  CLAIM_EVIDENCE_TYPES,
  CLAIM_EVIDENCE_RELATIONS,
  CLAIM_STATUSES,
  CLAIM_EVIDENCE_GRADES,
  ClaimEvidenceRegistry,
  validateClaimRegistryConstants,
  CLAIM_CHALLENGE_OUTCOMES,
  CLAIM_CHALLENGE_STATES,
  ClaimChallengeRegistry,
  validateChallengeConstants,
  STRESS_LAB_VERSION,
  DEFAULT_STRESS_WEIGHTS,
  DEFAULT_PROBE_COSTS,
  generateClaimStressReport,
  preregisterStressCandidate,
  validateStressWeights,
  CAMPAIGN_VERSION,
  CAMPAIGN_GATE_DECISIONS,
  DEFAULT_CAMPAIGN_POLICY,
  normalizeCampaignPolicy,
  verifyResearchCampaignPlan,
  createResearchCampaignPlan,
  ResearchCampaignTracker,
  validateCampaignConstants,
  ADAPTIVE_CAMPAIGN_VERSION,
  verifyAdaptiveCampaignRevision,
  createAdaptiveCampaignRevision,
  activateAdaptiveCampaignRevision,
  adaptiveCampaignLineage,
  PORTFOLIO_VERSION,
  DEFAULT_PORTFOLIO_WEIGHTS,
  DEFAULT_PORTFOLIO_POLICY,
  validatePortfolioWeights,
  normalizePortfolioPolicy,
  verifyResearchPortfolio,
  createResearchPortfolio,
  portfolioRecommendation,
  createPortfolioSelectionReceipt,
  PORTFOLIO_GOVERNANCE_VERSION,
  DEFAULT_PORTFOLIO_GOVERNANCE_POLICY,
  GOVERNANCE_REVIEW_FLAGS,
  normalizePortfolioGovernancePolicy,
  PortfolioGovernanceRegistry,
  POLICY_REVISION_VERSION,
  POLICY_TRIAL_VERSION,
  POLICY_COMPARISON_VERSION,
  POLICY_ROUND_OUTCOME_VERSION,
  POLICY_TRIAL_ASSIGNMENT_MODES,
  createPortfolioPolicyRevision,
  verifyPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  verifyProspectivePolicyTrialProtocol,
  policyTrialAssignment,
  createProspectivePolicyComparison,
  verifyProspectivePolicyComparison,
  recordProspectivePolicyRoundOutcome,
  verifyProspectivePolicyRoundOutcome,
  summarizeProspectivePolicyTrial
} from "../src/index.js";

const required=[
  "README.md","LICENSE",
  "docs/CONSTITUTION.md","docs/ARCHITECTURE.md","docs/FAILURE_TAXONOMY.md","docs/GOVERNANCE.md",
  "docs/SESSION_OBSERVATORY.md","docs/EXPERIMENTAL_PROBES.md","docs/PHI_INTERFEROMETER.md",
  "docs/LONGITUDINAL_PROFILES.md","docs/CASE_FILES.md","docs/DIFFERENTIAL_HYPOTHESES.md",
  "docs/CASE_CONFERENCE.md","docs/CALIBRATION_BENCHMARK.md","docs/REAL_CASE_INTAKE.md",
  "docs/SEALED_EXTERNAL_EVALUATION.md","docs/INDEPENDENT_CUSTODY.md",
  "schemas/observation.schema.json","schemas/assessment.schema.json","schemas/intervention.schema.json",
  "schemas/ledger-entry.schema.json","schemas/session-event.schema.json","schemas/session-report.schema.json",
  "schemas/experiment-plan.schema.json","schemas/probe-result.schema.json","schemas/interferometer-result.schema.json",
  "schemas/profile-context.schema.json","schemas/longitudinal-profile.schema.json","schemas/profile-comparison.schema.json",
  "schemas/case-event.schema.json","schemas/case-file.schema.json","schemas/intervention-history.schema.json",
  "schemas/differential-snapshot.schema.json","schemas/differential-evidence.schema.json",
  "schemas/conference-review.schema.json","schemas/conference-report.schema.json",
  "schemas/empirical-model.schema.json","schemas/benchmark-report.schema.json",
  "schemas/real-case-candidate.schema.json","schemas/real-case-dataset.schema.json",
  "schemas/sealed-evaluation-manifest.schema.json","schemas/sealed-evaluation-receipt.schema.json",
  "schemas/independent-challenge.schema.json","schemas/private-custody.schema.json",
  "schemas/independent-submission.schema.json","schemas/independent-evaluation-receipt.schema.json",
  "schemas/evaluator-signature.schema.json",
  "schemas/replication-protocol.schema.json","schemas/replication-receipt.schema.json",
  "schemas/replication-registry.schema.json","schemas/replication-registry-summary.schema.json",
  "schemas/claim.schema.json","schemas/claim-evidence.schema.json","schemas/claim-assessment.schema.json","schemas/claim-evidence-graph.schema.json",
  "schemas/claim-challenge.schema.json","schemas/claim-challenge-result.schema.json","schemas/claim-challenge-registry.schema.json",
  "schemas/claim-stress-report.schema.json","schemas/stress-selection-receipt.schema.json",
  "schemas/research-campaign-plan.schema.json","schemas/research-campaign-gate.schema.json","schemas/research-campaign-tracker.schema.json",
  "schemas/adaptive-campaign-revision.schema.json","schemas/adaptive-campaign-activation.schema.json","schemas/adaptive-campaign-lineage.schema.json",
  "schemas/research-portfolio.schema.json","schemas/portfolio-program.schema.json","schemas/portfolio-selection-receipt.schema.json",
  "schemas/portfolio-governance-selection.schema.json","schemas/portfolio-governance-outcome.schema.json","schemas/portfolio-governance-review.schema.json","schemas/portfolio-governance-registry.schema.json",
  "schemas/portfolio-policy-revision.schema.json","schemas/prospective-policy-trial.schema.json","schemas/prospective-policy-comparison.schema.json","schemas/prospective-policy-round-outcome.schema.json","schemas/prospective-policy-trial-summary.schema.json",
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

for(const [name,value] of Object.entries({
  SealedEvaluationHarness,
  verifyEvaluationReceipt,
  predictEvaluationManifest,
  createIndependentCustodySplit,
  createIndependentSubmission,
  scoreIndependentSubmission,
  signIndependentEvaluationReceipt,
  verifyIndependentEvaluationReceipt,
  predictIndependentChallenge,
  verifyEvaluatorSignature,
  createReplicationProtocol,
  createReplicationReceipt,
  verifyReplicationProtocol,
  verifyReplicationReceipt,
  ReplicationEvidenceRegistry,
  ClaimEvidenceRegistry,
  validateClaimRegistryConstants,
  ClaimChallengeRegistry,
  validateChallengeConstants,
  generateClaimStressReport,
  preregisterStressCandidate,
  validateStressWeights,
  normalizeCampaignPolicy,
  verifyResearchCampaignPlan,
  createResearchCampaignPlan,
  ResearchCampaignTracker,
  validateCampaignConstants,
  verifyAdaptiveCampaignRevision,
  createAdaptiveCampaignRevision,
  activateAdaptiveCampaignRevision,
  adaptiveCampaignLineage,
  validatePortfolioWeights,
  normalizePortfolioPolicy,
  verifyResearchPortfolio,
  createResearchPortfolio,
  portfolioRecommendation,
  createPortfolioSelectionReceipt,
  normalizePortfolioGovernancePolicy,
  PortfolioGovernanceRegistry,
  createPortfolioPolicyRevision,
  verifyPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  verifyProspectivePolicyTrialProtocol,
  policyTrialAssignment,
  createProspectivePolicyComparison,
  verifyProspectivePolicyComparison,
  recordProspectivePolicyRoundOutcome,
  verifyProspectivePolicyRoundOutcome,
  summarizeProspectivePolicyTrial
})){
  if(typeof value!=="function") throw new Error(name+" export missing");
}

if(REPLICATION_STATUSES.length!==6) throw new Error("Expected 6 replication statuses");
if(REPLICATION_EVIDENCE_GRADES.length!==5) throw new Error("Expected 5 replication evidence grades");
if(DEFAULT_EVIDENCE_LADDER_POLICY.robustCandidate.minSupportReplicators<4) throw new Error("Robust evidence policy unexpectedly weak");
if(CLAIM_EVIDENCE_TYPES.length!==10) throw new Error("Expected 10 claim evidence types");
if(CLAIM_EVIDENCE_RELATIONS.length!==4) throw new Error("Expected 4 claim evidence relations");
if(CLAIM_STATUSES.length!==5) throw new Error("Expected 5 claim statuses");
if(CLAIM_EVIDENCE_GRADES.length!==7) throw new Error("Expected 7 claim evidence grades");
const claimConstantErrors=validateClaimRegistryConstants();
if(claimConstantErrors.length) throw new Error("Claim registry constant errors: "+claimConstantErrors.join(", "));
if(CLAIM_CHALLENGE_OUTCOMES.length!==4) throw new Error("Expected 4 claim challenge outcomes");
if(CLAIM_CHALLENGE_STATES.length!==2) throw new Error("Expected 2 claim challenge states");
const challengeConstantErrors=validateChallengeConstants();
if(challengeConstantErrors.length) throw new Error("Challenge constant errors: "+challengeConstantErrors.join(", "));
if(STRESS_LAB_VERSION!=="STRESS_LAB_V0.1") throw new Error("Unexpected stress lab version");
validateStressWeights(DEFAULT_STRESS_WEIGHTS);
if(Object.keys(DEFAULT_PROBE_COSTS).length!==PROBE_CATALOG.length) throw new Error("Stress cost catalog must cover every probe");
if(CAMPAIGN_VERSION!=="RESEARCH_CAMPAIGN_V0.1") throw new Error("Unexpected campaign version");
if(CAMPAIGN_GATE_DECISIONS.length!==9) throw new Error("Expected 9 campaign gate decisions");
normalizeCampaignPolicy(DEFAULT_CAMPAIGN_POLICY);
const campaignErrors=validateCampaignConstants();
if(campaignErrors.length) throw new Error("Campaign constant errors: "+campaignErrors.join(", "));
if(ADAPTIVE_CAMPAIGN_VERSION!=="ADAPTIVE_CAMPAIGN_REVISION_V0.1") throw new Error("Unexpected adaptive campaign version");
if(PORTFOLIO_VERSION!=="RESEARCH_PORTFOLIO_V0.1") throw new Error("Unexpected portfolio version");
validatePortfolioWeights(DEFAULT_PORTFOLIO_WEIGHTS);
normalizePortfolioPolicy(DEFAULT_PORTFOLIO_POLICY);
if(PORTFOLIO_GOVERNANCE_VERSION!=="PORTFOLIO_GOVERNANCE_V0.1") throw new Error("Unexpected portfolio governance version");
if(GOVERNANCE_REVIEW_FLAGS.length!==3) throw new Error("Expected 3 governance review flags");
normalizePortfolioGovernancePolicy(DEFAULT_PORTFOLIO_GOVERNANCE_POLICY);
if(POLICY_REVISION_VERSION!=="PORTFOLIO_POLICY_REVISION_V0.1") throw new Error("Unexpected policy revision version");
if(POLICY_TRIAL_VERSION!=="PROSPECTIVE_POLICY_TRIAL_V0.1") throw new Error("Unexpected policy trial version");
if(POLICY_COMPARISON_VERSION!=="PROSPECTIVE_POLICY_COMPARISON_V0.1") throw new Error("Unexpected policy comparison version");
if(POLICY_ROUND_OUTCOME_VERSION!=="PROSPECTIVE_POLICY_ROUND_OUTCOME_V0.1") throw new Error("Unexpected policy round outcome version");
if(POLICY_TRIAL_ASSIGNMENT_MODES.length!==2) throw new Error("Expected 2 policy trial assignment modes");

const manifest=JSON.parse(await readFile("fixtures/benchmark-v0.1-manifest.json","utf8"));
if(manifest.fingerprint!==dataset.fingerprint) throw new Error("Benchmark manifest fingerprint mismatch");

console.log("SIcologist repository contracts valid.");
