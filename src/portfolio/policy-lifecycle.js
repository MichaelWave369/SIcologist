import {fingerprint} from "../experiment/fingerprint.js";
import {normalizePortfolioPolicy} from "./policy.js";
import {
  verifyPortfolioPolicyRevision,
  verifyProspectivePolicyTrialProtocol
} from "./policy-trial.js";

export const POLICY_PROMOTION_VERSION="POLICY_PROMOTION_PROPOSAL_V0.1";
export const ACTIVE_POLICY_STATE_VERSION="ACTIVE_PORTFOLIO_POLICY_STATE_V0.1";
export const POLICY_MONITOR_VERSION="POST_ACTIVATION_POLICY_MONITOR_V0.1";
export const POLICY_ROLLBACK_VERSION="POLICY_ROLLBACK_RECEIPT_V0.1";

export const DEFAULT_POST_ACTIVATION_POLICY=Object.freeze({
  minCompletedOutcomes:3,
  maxInconclusiveRate:.50,
  maxContradictionRate:.50
});

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }
function rate(count,total){ return total?round(count/total):0; }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function verifyTrialSummary(summary){
  return Boolean(
    summary?.version==="PROSPECTIVE_POLICY_TRIAL_SUMMARY_V0.1"&&
    verifyFingerprint(summary)
  );
}

function governanceSnapshot(value){
  const snapshot=value&&typeof value.export==="function"?value.export():clone(value);
  if(
    snapshot?.version!=="PORTFOLIO_GOVERNANCE_REGISTRY_V0.1"||
    !verifyFingerprint(snapshot)
  ){
    throw new Error("Portfolio governance registry fingerprint mismatch");
  }
  return snapshot;
}

function normalizeMonitoringPolicy(policy={}){
  const value={...DEFAULT_POST_ACTIVATION_POLICY,...policy};
  if(!Number.isInteger(value.minCompletedOutcomes)||value.minCompletedOutcomes<1){
    throw new TypeError("minCompletedOutcomes must be an integer >= 1");
  }
  for(const key of ["maxInconclusiveRate","maxContradictionRate"]){
    if(
      typeof value[key]!=="number"||
      !Number.isFinite(value[key])||
      value[key]<0||
      value[key]>1
    ){
      throw new TypeError(key+" must be in [0,1]");
    }
  }
  return Object.freeze({...value});
}

function policyFingerprint(policy){
  return fingerprint(normalizePortfolioPolicy(policy));
}

export function createPolicyPromotionProposal(policyRevision,trialProtocol,trialSummary,{
  reviewerId,
  promotionReason,
  riskAcceptance,
  monitoringPolicy={}
}={}){
  if(!verifyPortfolioPolicyRevision(policyRevision)){
    throw new Error("Portfolio policy revision fingerprint mismatch");
  }
  if(!verifyProspectivePolicyTrialProtocol(trialProtocol)){
    throw new Error("Prospective policy trial fingerprint mismatch");
  }
  if(!verifyTrialSummary(trialSummary)){
    throw new Error("Prospective policy trial summary fingerprint mismatch");
  }
  if(trialProtocol.policyRevisionFingerprint!==policyRevision.fingerprint){
    throw new Error("Trial protocol does not belong to policy revision");
  }
  if(trialSummary.trialProtocolFingerprint!==trialProtocol.fingerprint){
    throw new Error("Trial summary does not belong to trial protocol");
  }
  if(
    trialProtocol.baselinePolicyFingerprint!==policyRevision.baselinePolicyFingerprint||
    trialProtocol.candidatePolicyFingerprint!==policyRevision.proposedPolicyFingerprint
  ){
    throw new Error("Trial policies do not match policy revision");
  }
  if(
    trialSummary.minRoundsMet!==true||
    trialSummary.evaluationStatus!=="HUMAN_POLICY_REVIEW_REQUIRED"||
    trialSummary.baseline?.assignedRoundCount<1||
    trialSummary.candidate?.assignedRoundCount<1
  ){
    throw new Error("Policy promotion requires completed prospective evidence from both arms");
  }
  if(typeof reviewerId!=="string"||!reviewerId.trim()){
    throw new TypeError("reviewerId is required");
  }
  if(typeof promotionReason!=="string"||!promotionReason.trim()){
    throw new TypeError("promotionReason is required");
  }
  if(typeof riskAcceptance!=="string"||!riskAcceptance.trim()){
    throw new TypeError("riskAcceptance is required");
  }

  const monitor=normalizeMonitoringPolicy(monitoringPolicy);
  const baseline=normalizePortfolioPolicy(policyRevision.baselinePolicy);
  const candidate=normalizePortfolioPolicy(policyRevision.proposedPolicy);

  const body={
    version:POLICY_PROMOTION_VERSION,
    policyRevisionFingerprint:policyRevision.fingerprint,
    trialProtocolFingerprint:trialProtocol.fingerprint,
    trialSummaryFingerprint:trialSummary.fingerprint,
    baselinePolicy:clone(baseline),
    baselinePolicyFingerprint:fingerprint(baseline),
    candidatePolicy:clone(candidate),
    candidatePolicyFingerprint:fingerprint(candidate),
    descriptiveTrialDeltas:clone(trialSummary.deltas),
    reviewerId:reviewerId.trim(),
    promotionReason:promotionReason.trim(),
    riskAcceptance:riskAcceptance.trim(),
    monitoringPolicy:clone(monitor),
    status:"PROMOTION_REVIEWED_NOT_ACTIVATED",
    boundaries:{
      candidateWasAutomaticallyPromoted:false,
      causalPolicySuperiority:"NOT_ESTABLISHED",
      operatorActivationRequired:true,
      rollbackTargetPreserved:true
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyPolicyPromotionProposal(value){
  return Boolean(
    value?.version===POLICY_PROMOTION_VERSION&&
    verifyFingerprint(value)&&
    value.baselinePolicyFingerprint===policyFingerprint(value.baselinePolicy)&&
    value.candidatePolicyFingerprint===policyFingerprint(value.candidatePolicy)
  );
}

export function activatePolicyPromotion(proposal,governanceRegistry,{
  operatorApproved=false,
  approvalReceipt=null
}={}){
  if(!verifyPolicyPromotionProposal(proposal)){
    throw new Error("Policy promotion proposal fingerprint mismatch");
  }
  if(operatorApproved!==true) throw new Error("Operator approval is required");
  if(typeof approvalReceipt!=="string"||!approvalReceipt.trim()){
    throw new Error("A non-empty approval receipt is required");
  }

  const snapshot=governanceSnapshot(governanceRegistry);
  const baselineSelections=(snapshot.selections??[]).map(item=>item.fingerprint).sort();
  const baselineOutcomes=(snapshot.outcomes??[]).map(item=>item.fingerprint).sort();

  const stateBody={
    version:ACTIVE_POLICY_STATE_VERSION,
    generation:1,
    activePolicy:clone(proposal.candidatePolicy),
    activePolicyFingerprint:proposal.candidatePolicyFingerprint,
    rollbackPolicy:clone(proposal.baselinePolicy),
    rollbackPolicyFingerprint:proposal.baselinePolicyFingerprint,
    promotionProposalFingerprint:proposal.fingerprint,
    previousStateFingerprint:null,
    monitoringPolicy:clone(proposal.monitoringPolicy),
    monitoringBaseline:{
      governanceRegistryFingerprint:snapshot.fingerprint,
      selectionFingerprints:baselineSelections,
      outcomeFingerprints:baselineOutcomes
    },
    status:"ACTIVE_MONITORED",
    authority:{
      portfolioPolicyActivated:true,
      portfolioSelectionAuthorized:false,
      campaignSelectionAuthorized:false,
      experimentExecutionAuthorized:false
    }
  };
  const state={...stateBody,fingerprint:fingerprint(stateBody)};

  const receiptBody={
    version:"POLICY_ACTIVATION_RECEIPT_V0.1",
    promotionProposalFingerprint:proposal.fingerprint,
    activePolicyStateFingerprint:state.fingerprint,
    activePolicyFingerprint:state.activePolicyFingerprint,
    rollbackPolicyFingerprint:state.rollbackPolicyFingerprint,
    operatorApproved:true,
    approvalReceipt:approvalReceipt.trim(),
    experimentExecutionAuthorized:false
  };

  return {
    state,
    activationReceipt:{...receiptBody,fingerprint:fingerprint(receiptBody)}
  };
}

export function verifyActivePolicyState(value){
  return Boolean(
    value?.version===ACTIVE_POLICY_STATE_VERSION&&
    verifyFingerprint(value)&&
    value.activePolicyFingerprint===policyFingerprint(value.activePolicy)&&
    value.rollbackPolicyFingerprint===policyFingerprint(value.rollbackPolicy)
  );
}

export function monitorActivePolicy(state,governanceRegistry){
  if(!verifyActivePolicyState(state)){
    throw new Error("Active policy state fingerprint mismatch");
  }
  const snapshot=governanceSnapshot(governanceRegistry);
  const oldSelections=new Set(state.monitoringBaseline.selectionFingerprints);
  const oldOutcomes=new Set(state.monitoringBaseline.outcomeFingerprints);

  const selections=(snapshot.selections??[]).filter(item=>
    !oldSelections.has(item.fingerprint)&&
    item.policyFingerprint===state.activePolicyFingerprint
  );
  const selectionIds=new Set(selections.map(item=>item.fingerprint));
  const outcomes=(snapshot.outcomes??[]).filter(item=>
    !oldOutcomes.has(item.fingerprint)&&
    item.policyFingerprint===state.activePolicyFingerprint&&
    selectionIds.has(item.selectionFingerprint)
  );
  const completedIds=new Set(outcomes.map(item=>item.selectionFingerprint));
  const pending=selections.filter(item=>!completedIds.has(item.fingerprint));

  const counts={
    SURVIVED_CHALLENGE:0,
    WEAKENED:0,
    CONTRADICTED:0,
    INCONCLUSIVE:0
  };
  for(const outcome of outcomes){
    if(Object.prototype.hasOwnProperty.call(counts,outcome.challengeOutcome)){
      counts[outcome.challengeOutcome]+=1;
    }
  }

  const completed=outcomes.length;
  const decisive=counts.SURVIVED_CHALLENGE+counts.WEAKENED+counts.CONTRADICTED;
  const inconclusiveRate=rate(counts.INCONCLUSIVE,completed);
  const contradictionRate=rate(counts.CONTRADICTED,completed);
  const flags=[];

  if(pending.length){
    flags.push({
      flag:"PENDING_POST_ACTIVATION_OUTCOMES",
      severity:"INFO",
      value:pending.length
    });
  }
  if(completed>=state.monitoringPolicy.minCompletedOutcomes){
    if(inconclusiveRate>state.monitoringPolicy.maxInconclusiveRate){
      flags.push({
        flag:"HIGH_POST_ACTIVATION_INCONCLUSIVE_RATE",
        severity:"ROLLBACK_REVIEW",
        value:inconclusiveRate,
        threshold:state.monitoringPolicy.maxInconclusiveRate
      });
    }
    if(contradictionRate>state.monitoringPolicy.maxContradictionRate){
      flags.push({
        flag:"HIGH_POST_ACTIVATION_CONTRADICTION_RATE",
        severity:"ROLLBACK_REVIEW",
        value:contradictionRate,
        threshold:state.monitoringPolicy.maxContradictionRate
      });
    }
  }

  const rollbackRecommended=flags.some(item=>item.severity==="ROLLBACK_REVIEW");
  const body={
    version:POLICY_MONITOR_VERSION,
    activePolicyStateFingerprint:state.fingerprint,
    activePolicyFingerprint:state.activePolicyFingerprint,
    governanceRegistryFingerprint:snapshot.fingerprint,
    postActivationSelectionCount:selections.length,
    completedOutcomeCount:completed,
    pendingOutcomeCount:pending.length,
    decisiveOutcomeCount:decisive,
    decisiveRate:rate(decisive,completed),
    inconclusiveRate,
    contradictionRate,
    outcomeCounts:counts,
    flags,
    status:rollbackRecommended
      ?"ROLLBACK_REVIEW_RECOMMENDED"
      :completed<state.monitoringPolicy.minCompletedOutcomes
        ?"INSUFFICIENT_POST_ACTIVATION_EVIDENCE"
        :"CONTINUE_MONITORING",
    rollbackAuthorized:false,
    automaticRollback:false,
    boundaries:{
      trialOutcomesExcludedByActivationBaseline:true,
      observedRatesAreDescriptive:true,
      causalPolicyFailure:"NOT_ESTABLISHED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function rollbackActivePolicy(state,monitorReport,governanceRegistry,{
  operatorApproved=false,
  approvalReceipt=null,
  rollbackReason
}={}){
  if(!verifyActivePolicyState(state)){
    throw new Error("Active policy state fingerprint mismatch");
  }
  if(
    monitorReport?.version!==POLICY_MONITOR_VERSION||
    !verifyFingerprint(monitorReport)||
    monitorReport.activePolicyStateFingerprint!==state.fingerprint
  ){
    throw new Error("Policy monitor report fingerprint mismatch");
  }
  if(operatorApproved!==true) throw new Error("Operator approval is required");
  if(typeof approvalReceipt!=="string"||!approvalReceipt.trim()){
    throw new Error("A non-empty approval receipt is required");
  }
  if(typeof rollbackReason!=="string"||!rollbackReason.trim()){
    throw new TypeError("rollbackReason is required");
  }

  const snapshot=governanceSnapshot(governanceRegistry);
  if(snapshot.fingerprint!==monitorReport.governanceRegistryFingerprint){
    throw new Error("Rollback governance snapshot differs from monitor report");
  }

  const nextBody={
    version:ACTIVE_POLICY_STATE_VERSION,
    generation:state.generation+1,
    activePolicy:clone(state.rollbackPolicy),
    activePolicyFingerprint:state.rollbackPolicyFingerprint,
    rollbackPolicy:clone(state.activePolicy),
    rollbackPolicyFingerprint:state.activePolicyFingerprint,
    promotionProposalFingerprint:state.promotionProposalFingerprint,
    previousStateFingerprint:state.fingerprint,
    monitoringPolicy:clone(state.monitoringPolicy),
    monitoringBaseline:{
      governanceRegistryFingerprint:snapshot.fingerprint,
      selectionFingerprints:(snapshot.selections??[]).map(item=>item.fingerprint).sort(),
      outcomeFingerprints:(snapshot.outcomes??[]).map(item=>item.fingerprint).sort()
    },
    status:"ROLLED_BACK_MONITORED",
    authority:{
      portfolioPolicyActivated:true,
      portfolioSelectionAuthorized:false,
      campaignSelectionAuthorized:false,
      experimentExecutionAuthorized:false
    }
  };
  const nextState={...nextBody,fingerprint:fingerprint(nextBody)};

  const receiptBody={
    version:POLICY_ROLLBACK_VERSION,
    priorPolicyStateFingerprint:state.fingerprint,
    monitorReportFingerprint:monitorReport.fingerprint,
    rollbackFromPolicyFingerprint:state.activePolicyFingerprint,
    rollbackToPolicyFingerprint:state.rollbackPolicyFingerprint,
    nextPolicyStateFingerprint:nextState.fingerprint,
    monitorStatusAtRollback:monitorReport.status,
    discretionaryRollback:monitorReport.status!=="ROLLBACK_REVIEW_RECOMMENDED",
    rollbackReason:rollbackReason.trim(),
    operatorApproved:true,
    approvalReceipt:approvalReceipt.trim(),
    experimentExecutionAuthorized:false
  };

  return {
    state:nextState,
    rollbackReceipt:{...receiptBody,fingerprint:fingerprint(receiptBody)}
  };
}

export function activePolicyStateLineage(states){
  if(!Array.isArray(states)||!states.length){
    throw new TypeError("states must be a non-empty array");
  }
  const rows=states.map(item=>{
    if(!verifyActivePolicyState(item)){
      throw new Error("Active policy state fingerprint mismatch");
    }
    return clone(item);
  }).sort((a,b)=>a.generation-b.generation);

  for(let i=1;i<rows.length;i++){
    if(rows[i].generation!==rows[i-1].generation+1){
      throw new Error("Policy state generations are not continuous");
    }
    if(rows[i].previousStateFingerprint!==rows[i-1].fingerprint){
      throw new Error("Policy state lineage is discontinuous");
    }
  }

  const body={
    version:"ACTIVE_POLICY_STATE_LINEAGE_V0.1",
    generationCount:rows.length,
    states:rows.map(item=>({
      generation:item.generation,
      fingerprint:item.fingerprint,
      previousStateFingerprint:item.previousStateFingerprint,
      activePolicyFingerprint:item.activePolicyFingerprint,
      rollbackPolicyFingerprint:item.rollbackPolicyFingerprint,
      status:item.status
    }))
  };
  return {...body,fingerprint:fingerprint(body)};
}
