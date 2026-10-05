import {fingerprint} from "../experiment/fingerprint.js";
import {ResearchCampaignTracker} from "../campaign/planner.js";
import {
  createResearchPortfolio,
  verifyResearchPortfolio
} from "./engine.js";
import {normalizePortfolioPolicy} from "./policy.js";

export const POLICY_REVISION_VERSION="PORTFOLIO_POLICY_REVISION_V0.1";
export const POLICY_TRIAL_VERSION="PROSPECTIVE_POLICY_TRIAL_V0.1";
export const POLICY_COMPARISON_VERSION="PROSPECTIVE_POLICY_COMPARISON_V0.1";
export const POLICY_ROUND_OUTCOME_VERSION="PROSPECTIVE_POLICY_ROUND_OUTCOME_V0.1";

export const POLICY_TRIAL_ASSIGNMENT_MODES=Object.freeze([
  "BASELINE_ACTIVE_CANDIDATE_SHADOW",
  "ALTERNATING_AB"
]);

const DEFAULT_PRIMARY_METRICS=Object.freeze([
  "decisiveRate",
  "inconclusiveRate",
  "contradictionRate"
]);

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }
function rate(count,total){ return total?round(count/total):0; }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function policyFingerprint(policy){
  return fingerprint(normalizePortfolioPolicy(policy));
}

function sameJson(a,b){
  return JSON.stringify(a)===JSON.stringify(b);
}

function verifyGovernanceReview(review){
  if(
    review?.version!=="PORTFOLIO_GOVERNANCE_REVIEW_V0.1"||
    !verifyFingerprint(review)
  ){
    throw new Error("Portfolio governance review fingerprint mismatch");
  }
  if(
    review.automaticWeightUpdate!==false||
    review.automaticBudgetUpdate!==false||
    review.automaticExecutionChange!==false
  ){
    throw new Error("Governance review violates no-self-tuning boundary");
  }
}

export function createPortfolioPolicyRevision({
  baselinePolicy,
  proposedPolicy,
  governanceReview,
  revisionReason,
  proposerId="operator"
}){
  verifyGovernanceReview(governanceReview);
  if(typeof revisionReason!=="string"||!revisionReason.trim()){
    throw new TypeError("revisionReason is required");
  }
  if(typeof proposerId!=="string"||!proposerId.trim()){
    throw new TypeError("proposerId is required");
  }

  const baseline=normalizePortfolioPolicy(baselinePolicy);
  const proposed=normalizePortfolioPolicy(proposedPolicy);
  if(sameJson(baseline,proposed)){
    throw new Error("Proposed portfolio policy must differ from baseline");
  }

  const body={
    version:POLICY_REVISION_VERSION,
    baselinePolicy:clone(baseline),
    baselinePolicyFingerprint:fingerprint(baseline),
    proposedPolicy:clone(proposed),
    proposedPolicyFingerprint:fingerprint(proposed),
    sourceGovernanceReviewFingerprint:governanceReview.fingerprint,
    revisionReason:revisionReason.trim(),
    proposerId:proposerId.trim(),
    status:"PROPOSED_NOT_ACTIVATED",
    boundaries:{
      retrospectiveOutcomeReuseForPromotion:false,
      automaticActivation:false,
      automaticWeightUpdate:false,
      scientificSuperiority:"NOT_ESTABLISHED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyPortfolioPolicyRevision(value){
  return Boolean(
    value?.version===POLICY_REVISION_VERSION&&
    verifyFingerprint(value)&&
    value.baselinePolicyFingerprint===fingerprint(value.baselinePolicy)&&
    value.proposedPolicyFingerprint===fingerprint(value.proposedPolicy)
  );
}

function normalizeMetrics(metrics){
  if(!Array.isArray(metrics)||!metrics.length){
    throw new TypeError("primaryMetrics must be a non-empty array");
  }
  const allowed=new Set([
    "decisiveRate",
    "inconclusiveRate",
    "contradictionRate",
    "completedOutcomeCount"
  ]);
  const cleaned=[...new Set(metrics.map(value=>{
    if(typeof value!=="string"||!allowed.has(value)){
      throw new TypeError("Unsupported policy trial metric: "+value);
    }
    return value;
  }))];
  return cleaned.sort();
}

export function createProspectivePolicyTrialProtocol(policyRevision,{
  assignmentMode="ALTERNATING_AB",
  minRounds=4,
  primaryMetrics=DEFAULT_PRIMARY_METRICS,
  preregistrationNote="",
  operatorApproved=false,
  approvalReceipt=null
}={}){
  if(!verifyPortfolioPolicyRevision(policyRevision)){
    throw new Error("Portfolio policy revision fingerprint mismatch");
  }
  if(!POLICY_TRIAL_ASSIGNMENT_MODES.includes(assignmentMode)){
    throw new TypeError("Unsupported policy trial assignment mode");
  }
  if(!Number.isInteger(minRounds)||minRounds<2){
    throw new TypeError("minRounds must be an integer >= 2");
  }
  if(operatorApproved!==true) throw new Error("Operator approval is required");
  if(typeof approvalReceipt!=="string"||!approvalReceipt.trim()){
    throw new Error("A non-empty approval receipt is required");
  }

  const body={
    version:POLICY_TRIAL_VERSION,
    policyRevisionFingerprint:policyRevision.fingerprint,
    baselinePolicy:clone(policyRevision.baselinePolicy),
    baselinePolicyFingerprint:policyRevision.baselinePolicyFingerprint,
    candidatePolicy:clone(policyRevision.proposedPolicy),
    candidatePolicyFingerprint:policyRevision.proposedPolicyFingerprint,
    assignmentMode,
    minRounds,
    primaryMetrics:normalizeMetrics(primaryMetrics),
    preregistrationNote:typeof preregistrationNote==="string"?preregistrationNote.trim():"",
    approvalReceipt:approvalReceipt.trim(),
    status:"PREREGISTERED",
    assignmentEvidence:{
      externallyRandomized:false,
      allocationConcealed:false,
      causalInference:"NOT_ESTABLISHED"
    },
    boundaries:{
      candidateAutoActivated:false,
      portfolioSelectionAutoAuthorized:false,
      experimentExecutionAuthorized:false,
      retrospectiveMetricChangeAllowed:false
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyProspectivePolicyTrialProtocol(value){
  return Boolean(
    value?.version===POLICY_TRIAL_VERSION&&
    verifyFingerprint(value)&&
    value.baselinePolicyFingerprint===fingerprint(value.baselinePolicy)&&
    value.candidatePolicyFingerprint===fingerprint(value.candidatePolicy)
  );
}

export function policyTrialAssignment(protocol,roundIndex){
  if(!verifyProspectivePolicyTrialProtocol(protocol)){
    throw new Error("Prospective policy trial fingerprint mismatch");
  }
  if(!Number.isInteger(roundIndex)||roundIndex<1){
    throw new TypeError("roundIndex must be an integer >= 1");
  }
  if(protocol.assignmentMode==="BASELINE_ACTIVE_CANDIDATE_SHADOW"){
    return "BASELINE";
  }
  return roundIndex%2===1?"BASELINE":"CANDIDATE";
}

function trackerSnapshot(value){
  const snapshot=typeof value?.export==="function"?value.export():value;
  if(snapshot?.version!=="RESEARCH_CAMPAIGN_TRACKER_V0.1"||!verifyFingerprint(snapshot)){
    throw new Error("Campaign tracker fingerprint mismatch");
  }
  ResearchCampaignTracker.fromSnapshot(snapshot);
  return clone(snapshot);
}

function cohort(programs){
  if(!Array.isArray(programs)||!programs.length){
    throw new TypeError("programs must be a non-empty array");
  }
  const seenIds=new Set();
  const seenTrackers=new Set();
  const rows=programs.map(input=>{
    if(typeof input?.programId!=="string"||!input.programId.trim()){
      throw new TypeError("programId is required");
    }
    const id=input.programId.trim();
    const snapshot=trackerSnapshot(input.tracker);
    const importance=input.operatorImportance??.5;
    if(typeof importance!=="number"||!Number.isFinite(importance)||importance<0||importance>1){
      throw new TypeError("operatorImportance must be in [0,1]");
    }
    if(seenIds.has(id)) throw new Error("Duplicate programId");
    if(seenTrackers.has(snapshot.fingerprint)) throw new Error("Duplicate campaign tracker");
    seenIds.add(id);
    seenTrackers.add(snapshot.fingerprint);
    return {
      programId:id,
      trackerFingerprint:snapshot.fingerprint,
      planFingerprint:snapshot.plan.fingerprint,
      operatorImportance:round(importance)
    };
  }).sort((a,b)=>a.programId.localeCompare(b.programId));
  return {rows,fingerprint:fingerprint(rows)};
}

function allocationMap(portfolio){
  return new Map(portfolio.allocation.allocations.map(item=>[item.programId,item]));
}

function programMap(portfolio){
  return new Map(portfolio.programs.map(item=>[item.programId,item]));
}

function comparePortfolios(baseline,candidate){
  const baseAlloc=allocationMap(baseline);
  const candAlloc=allocationMap(candidate);
  const basePrograms=programMap(baseline);
  const candPrograms=programMap(candidate);
  const ids=[...new Set([
    ...baseline.programs.map(item=>item.programId),
    ...candidate.programs.map(item=>item.programId)
  ])].sort();

  const rows=ids.map(programId=>{
    const b=basePrograms.get(programId);
    const c=candPrograms.get(programId);
    const ba=baseAlloc.get(programId)??null;
    const ca=candAlloc.get(programId)??null;
    return {
      programId,
      baselinePriorityScore:b?.priorityScore??null,
      candidatePriorityScore:c?.priorityScore??null,
      priorityScoreDelta:
        b&&c?round(c.priorityScore-b.priorityScore):null,
      baselineAllocated:Boolean(ba),
      candidateAllocated:Boolean(ca),
      baselineRank:ba?.rank??null,
      candidateRank:ca?.rank??null,
      rankDelta:ba&&ca?ca.rank-ba.rank:null,
      baselineStepId:ba?.recommendedStepId??null,
      candidateStepId:ca?.recommendedStepId??null
    };
  });

  return {
    rows,
    allocatedByBoth:rows.filter(r=>r.baselineAllocated&&r.candidateAllocated).map(r=>r.programId),
    baselineOnly:rows.filter(r=>r.baselineAllocated&&!r.candidateAllocated).map(r=>r.programId),
    candidateOnly:rows.filter(r=>!r.baselineAllocated&&r.candidateAllocated).map(r=>r.programId),
    allocationAgreementRate:rate(
      rows.filter(r=>r.baselineAllocated===r.candidateAllocated).length,
      rows.length
    ),
    exactRankAgreementCount:rows.filter(r=>
      r.baselineRank!==null&&
      r.candidateRank!==null&&
      r.baselineRank===r.candidateRank
    ).length
  };
}

export function createProspectivePolicyComparison(claimRegistry,challengeRegistry,{
  programs,
  trialProtocol,
  roundIndex,
  roundKey,
  title=""
}){
  if(!verifyProspectivePolicyTrialProtocol(trialProtocol)){
    throw new Error("Prospective policy trial fingerprint mismatch");
  }
  if(typeof roundKey!=="string"||!roundKey.trim()){
    throw new TypeError("roundKey is required");
  }
  const frozenCohort=cohort(programs);

  const baselinePortfolio=createResearchPortfolio(claimRegistry,challengeRegistry,{
    programs,
    policy:trialProtocol.baselinePolicy,
    title:(title||"Policy trial")+" | baseline | round "+roundIndex
  });
  const candidatePortfolio=createResearchPortfolio(claimRegistry,challengeRegistry,{
    programs,
    policy:trialProtocol.candidatePolicy,
    title:(title||"Policy trial")+" | candidate | round "+roundIndex
  });
  if(!verifyResearchPortfolio(baselinePortfolio)||!verifyResearchPortfolio(candidatePortfolio)){
    throw new Error("Policy trial portfolio verification failed");
  }

  const assignedArm=policyTrialAssignment(trialProtocol,roundIndex);
  const activePortfolio=assignedArm==="BASELINE"?baselinePortfolio:candidatePortfolio;
  const shadowPortfolio=assignedArm==="BASELINE"?candidatePortfolio:baselinePortfolio;
  const comparison=comparePortfolios(baselinePortfolio,candidatePortfolio);

  const body={
    version:POLICY_COMPARISON_VERSION,
    trialProtocolFingerprint:trialProtocol.fingerprint,
    roundIndex,
    roundKey:roundKey.trim(),
    cohortFingerprint:frozenCohort.fingerprint,
    cohort:frozenCohort.rows,
    baselinePortfolio,
    candidatePortfolio,
    comparison,
    assignment:{
      assignedArm,
      activePortfolioFingerprint:activePortfolio.fingerprint,
      shadowPortfolioFingerprint:shadowPortfolio.fingerprint,
      candidateShadowOnly:assignedArm!=="CANDIDATE",
      portfolioSelectionStillRequiresOperator:true,
      experimentExecutionAuthorized:false
    },
    boundaries:{
      sameFrozenCohort:true,
      shadowRecommendationsAreCounterfactualOnly:true,
      causalPolicySuperiority:"NOT_ESTABLISHED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyProspectivePolicyComparison(value){
  return Boolean(
    value?.version===POLICY_COMPARISON_VERSION&&
    verifyFingerprint(value)&&
    verifyResearchPortfolio(value.baselinePortfolio)&&
    verifyResearchPortfolio(value.candidatePortfolio)
  );
}

function governanceSnapshot(value){
  if(value&&typeof value.export==="function"){
    return value.export();
  }
  return clone(value);
}

function aggregateActivePortfolioGovernance(snapshot,portfolioFingerprint){
  if(
    snapshot?.version!=="PORTFOLIO_GOVERNANCE_REGISTRY_V0.1"||
    !verifyFingerprint(snapshot)
  ){
    throw new Error("Portfolio governance registry fingerprint mismatch");
  }
  const selections=(snapshot.selections??[]).filter(item=>
    item.portfolioFingerprint===portfolioFingerprint
  );
  const selectionIds=new Set(selections.map(item=>item.fingerprint));
  const outcomes=(snapshot.outcomes??[]).filter(item=>
    item.portfolioFingerprint===portfolioFingerprint&&
    selectionIds.has(item.selectionFingerprint)
  );
  const completedIds=new Set(outcomes.map(item=>item.selectionFingerprint));
  const pending=selections.filter(item=>!completedIds.has(item.fingerprint));
  if(!selections.length){
    throw new Error("No governance selections recorded for assigned policy arm");
  }
  if(pending.length){
    throw new Error("Assigned policy arm still has pending governance outcomes");
  }
  if(!outcomes.length){
    throw new Error("Assigned policy arm has no completed governance outcomes");
  }

  const counts={
    SURVIVED_CHALLENGE:0,
    WEAKENED:0,
    CONTRADICTED:0,
    INCONCLUSIVE:0
  };
  for(const item of outcomes){
    if(Object.prototype.hasOwnProperty.call(counts,item.challengeOutcome)){
      counts[item.challengeOutcome]+=1;
    }
  }
  const decisive=counts.SURVIVED_CHALLENGE+counts.WEAKENED+counts.CONTRADICTED;
  return {
    selectedCount:selections.length,
    completedOutcomeCount:outcomes.length,
    decisiveOutcomeCount:decisive,
    decisiveRate:rate(decisive,outcomes.length),
    inconclusiveRate:rate(counts.INCONCLUSIVE,outcomes.length),
    contradictionRate:rate(counts.CONTRADICTED,outcomes.length),
    outcomeCounts:counts,
    governanceSelectionFingerprints:selections.map(item=>item.fingerprint).sort(),
    governanceOutcomeFingerprints:outcomes.map(item=>item.fingerprint).sort()
  };
}

export function recordProspectivePolicyRoundOutcome(comparison,governanceRegistry){
  if(!verifyProspectivePolicyComparison(comparison)){
    throw new Error("Prospective policy comparison fingerprint mismatch");
  }
  const snapshot=governanceSnapshot(governanceRegistry);
  const metrics=aggregateActivePortfolioGovernance(
    snapshot,
    comparison.assignment.activePortfolioFingerprint
  );
  const body={
    version:POLICY_ROUND_OUTCOME_VERSION,
    trialProtocolFingerprint:comparison.trialProtocolFingerprint,
    comparisonFingerprint:comparison.fingerprint,
    roundIndex:comparison.roundIndex,
    roundKey:comparison.roundKey,
    cohortFingerprint:comparison.cohortFingerprint,
    assignedArm:comparison.assignment.assignedArm,
    activePortfolioFingerprint:comparison.assignment.activePortfolioFingerprint,
    metrics,
    boundaries:{
      outcomeObservedProspectively:true,
      assignmentRandomized:false,
      policyEffectCausality:"NOT_ESTABLISHED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyProspectivePolicyRoundOutcome(value){
  return Boolean(
    value?.version===POLICY_ROUND_OUTCOME_VERSION&&
    verifyFingerprint(value)
  );
}

function armSummary(records,arm){
  const rows=records.filter(item=>item.assignedArm===arm);
  const totals=rows.reduce((acc,item)=>{
    acc.rounds+=1;
    acc.completed+=item.metrics.completedOutcomeCount;
    acc.decisive+=item.metrics.decisiveOutcomeCount;
    for(const key of Object.keys(acc.counts)){
      acc.counts[key]+=item.metrics.outcomeCounts[key]??0;
    }
    return acc;
  },{
    rounds:0,
    completed:0,
    decisive:0,
    counts:{
      SURVIVED_CHALLENGE:0,
      WEAKENED:0,
      CONTRADICTED:0,
      INCONCLUSIVE:0
    }
  });
  return {
    assignedRoundCount:totals.rounds,
    completedOutcomeCount:totals.completed,
    decisiveOutcomeCount:totals.decisive,
    decisiveRate:rate(totals.decisive,totals.completed),
    inconclusiveRate:rate(totals.counts.INCONCLUSIVE,totals.completed),
    contradictionRate:rate(totals.counts.CONTRADICTED,totals.completed),
    outcomeCounts:totals.counts
  };
}

export function summarizeProspectivePolicyTrial(trialProtocol,roundOutcomes){
  if(!verifyProspectivePolicyTrialProtocol(trialProtocol)){
    throw new Error("Prospective policy trial fingerprint mismatch");
  }
  if(!Array.isArray(roundOutcomes)) throw new TypeError("roundOutcomes must be an array");
  const seenIndexes=new Set();
  const seenKeys=new Set();
  const records=roundOutcomes.map(item=>{
    if(!verifyProspectivePolicyRoundOutcome(item)){
      throw new Error("Prospective policy round outcome fingerprint mismatch");
    }
    if(item.trialProtocolFingerprint!==trialProtocol.fingerprint){
      throw new Error("Round outcome belongs to another policy trial");
    }
    if(seenIndexes.has(item.roundIndex)) throw new Error("Duplicate policy trial roundIndex");
    if(seenKeys.has(item.roundKey)) throw new Error("Duplicate policy trial roundKey");
    seenIndexes.add(item.roundIndex);
    seenKeys.add(item.roundKey);
    if(policyTrialAssignment(trialProtocol,item.roundIndex)!==item.assignedArm){
      throw new Error("Round outcome assignment does not match trial protocol");
    }
    return clone(item);
  }).sort((a,b)=>a.roundIndex-b.roundIndex);

  const baseline=armSummary(records,"BASELINE");
  const candidate=armSummary(records,"CANDIDATE");
  const minRoundsMet=records.length>=trialProtocol.minRounds;
  const bothArmsObserved=baseline.assignedRoundCount>0&&candidate.assignedRoundCount>0;

  const body={
    version:"PROSPECTIVE_POLICY_TRIAL_SUMMARY_V0.1",
    trialProtocolFingerprint:trialProtocol.fingerprint,
    completedRoundCount:records.length,
    minRoundsRequired:trialProtocol.minRounds,
    minRoundsMet,
    baseline,
    candidate,
    deltas:{
      decisiveRate:round(candidate.decisiveRate-baseline.decisiveRate),
      inconclusiveRate:round(candidate.inconclusiveRate-baseline.inconclusiveRate),
      contradictionRate:round(candidate.contradictionRate-baseline.contradictionRate)
    },
    primaryMetrics:clone(trialProtocol.primaryMetrics),
    evaluationStatus:!minRoundsMet
      ?"INSUFFICIENT_PROSPECTIVE_EVIDENCE"
      :!bothArmsObserved
        ?"SHADOW_COMPARISON_ONLY"
        :"HUMAN_POLICY_REVIEW_REQUIRED",
    candidatePromotionAuthorized:false,
    automaticPolicyActivation:false,
    causalStatus:"NOT_ESTABLISHED",
    boundaries:{
      assignmentRandomized:false,
      observedOutcomeDifferencesAreNotCausalProof:true,
      humanReviewRequiredForPolicyActivation:true
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}
