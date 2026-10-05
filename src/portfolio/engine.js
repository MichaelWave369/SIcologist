import {fingerprint} from "../experiment/fingerprint.js";
import {ResearchCampaignTracker} from "../campaign/planner.js";
import {
  PORTFOLIO_VERSION,
  evidenceWeaknessForGrade,
  normalizePortfolioPolicy,
  replicationNeedForGrade
} from "./policy.js";

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function trackerSnapshot(value){
  const snapshot=typeof value?.export==="function"?value.export():value;
  if(snapshot?.version!=="RESEARCH_CAMPAIGN_TRACKER_V0.1"||!verifyFingerprint(snapshot)){
    throw new Error("Campaign tracker fingerprint mismatch");
  }
  ResearchCampaignTracker.fromSnapshot(snapshot);
  return clone(snapshot);
}

function importance(value){
  if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1){
    throw new TypeError("operatorImportance must be in [0,1]");
  }
  return round(value);
}

function priorityScore(components,weights){
  return round(
    components.informationOpportunity*weights.informationOpportunity+
    components.evidenceWeakness*weights.evidenceWeakness+
    components.replicationNeed*weights.replicationNeed+
    components.operatorImportance*weights.operatorImportance+
    components.costEfficiency*weights.costEfficiency
  );
}

function comparableProgram(a,b){
  return (
    b.priorityScore-a.priorityScore||
    b.components.informationOpportunity-a.components.informationOpportunity||
    b.components.evidenceWeakness-a.components.evidenceWeakness||
    a.nextEstimatedCost-b.nextEstimatedCost||
    a.programId.localeCompare(b.programId)
  );
}

function normalizeProgram(claimRegistry,challengeRegistry,input,weights){
  if(typeof input?.programId!=="string"||!input.programId.trim()){
    throw new TypeError("programId is required");
  }
  const snapshot=trackerSnapshot(input.tracker);
  const tracker=ResearchCampaignTracker.fromSnapshot(snapshot);
  const gate=tracker.gate(claimRegistry,challengeRegistry);
  const plan=snapshot.plan;
  const target=claimRegistry.claim(plan.target.claimId);
  const assessment=target&&!target.supersededBy
    ?claimRegistry.assessClaim(target.claimId)
    :null;
  const operatorImportance=importance(input.operatorImportance??.5);

  const ready=gate.decision==="READY_FOR_OPERATOR_SELECTION";
  const nextStep=ready?gate.detail.nextStep:null;
  const informationOpportunity=ready
    ?Math.max(0,Math.min(1,nextStep.stressScore))
    :0;
  const evidenceWeakness=assessment
    ?evidenceWeaknessForGrade(assessment.evidenceGrade)
    :1;
  const replicationNeed=assessment
    ?replicationNeedForGrade(assessment.strongestReplicationGrade)
    :1;
  const nextEstimatedCost=ready?nextStep.estimatedCost:null;
  const costEfficiency=ready
    ?round(1-Math.max(0,Math.min(1,nextEstimatedCost)))
    :0;

  const components={
    informationOpportunity:round(informationOpportunity),
    evidenceWeakness:round(evidenceWeakness),
    replicationNeed:round(replicationNeed),
    operatorImportance,
    costEfficiency
  };

  const body={
    version:"PORTFOLIO_PROGRAM_V0.1",
    programId:input.programId.trim(),
    trackerFingerprint:snapshot.fingerprint,
    planFingerprint:plan.fingerprint,
    targetClaimId:plan.target.claimId,
    targetClaimKey:plan.target.claimKey,
    targetRevision:plan.target.revision,
    currentAssessmentFingerprint:assessment?.fingerprint??null,
    currentClaimStatus:assessment?.status??"UNAVAILABLE",
    currentEvidenceGrade:assessment?.evidenceGrade??"UNAVAILABLE",
    strongestReplicationGrade:assessment?.strongestReplicationGrade??null,
    campaignGateDecision:gate.decision,
    eligibleForAllocation:ready,
    nextStep:nextStep?clone(nextStep):null,
    nextEstimatedCost,
    components,
    priorityScore:priorityScore(components,weights),
    recommendationOnly:true,
    executionAuthorized:false
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyResearchPortfolio(value){
  return Boolean(value?.version===PORTFOLIO_VERSION&&verifyFingerprint(value));
}

export function createResearchPortfolio(claimRegistry,challengeRegistry,{
  programs,
  policy={},
  title=""
}){
  if(!Array.isArray(programs)||!programs.length){
    throw new TypeError("programs must be a non-empty array");
  }
  const resolvedPolicy=normalizePortfolioPolicy(policy);
  const seenProgramIds=new Set();
  const seenTrackers=new Set();
  const seenPlans=new Set();

  const normalized=programs.map(input=>{
    const program=normalizeProgram(
      claimRegistry,
      challengeRegistry,
      input,
      resolvedPolicy.weights
    );
    if(seenProgramIds.has(program.programId)) throw new Error("Duplicate programId");
    if(seenTrackers.has(program.trackerFingerprint)) throw new Error("Duplicate campaign tracker");
    if(seenPlans.has(program.planFingerprint)) throw new Error("Duplicate campaign plan");
    seenProgramIds.add(program.programId);
    seenTrackers.add(program.trackerFingerprint);
    seenPlans.add(program.planFingerprint);
    return program;
  });

  const eligible=normalized
    .filter(item=>item.eligibleForAllocation)
    .sort(comparableProgram);

  const allocations=[];
  const unallocated=[];
  let totalCost=0;

  for(const program of eligible){
    if(allocations.length>=resolvedPolicy.maxAllocatedCampaigns){
      unallocated.push({
        programId:program.programId,
        reason:"ALLOCATION_COUNT_LIMIT"
      });
      continue;
    }
    const nextCost=round(totalCost+program.nextEstimatedCost);
    if(nextCost-resolvedPolicy.maxEstimatedCost>1e-9){
      unallocated.push({
        programId:program.programId,
        reason:"PORTFOLIO_COST_LIMIT"
      });
      continue;
    }
    const body={
      rank:allocations.length+1,
      programId:program.programId,
      programFingerprint:program.fingerprint,
      priorityScore:program.priorityScore,
      recommendedStepId:program.nextStep.stepId,
      recommendedProbeId:program.nextStep.probeId,
      recommendedEstimatedCost:program.nextEstimatedCost,
      allocationStatus:"RECOMMENDED",
      operatorApprovalRequired:true,
      executionAuthorized:false
    };
    allocations.push({...body,allocationId:fingerprint(body)});
    totalCost=nextCost;
  }

  for(const program of normalized.filter(item=>!item.eligibleForAllocation)){
    unallocated.push({
      programId:program.programId,
      reason:"CAMPAIGN_GATE_"+program.campaignGateDecision
    });
  }

  const body={
    version:PORTFOLIO_VERSION,
    title:typeof title==="string"?title.trim():"",
    policy:clone(resolvedPolicy),
    programs:normalized.sort((a,b)=>a.programId.localeCompare(b.programId)),
    allocation:{
      strategy:resolvedPolicy.allocationStrategy,
      allocatedCount:allocations.length,
      allocatedEstimatedCost:round(totalCost),
      allocations,
      unallocated:unallocated.sort((a,b)=>
        a.programId.localeCompare(b.programId)||
        a.reason.localeCompare(b.reason)
      )
    },
    boundaries:{
      portfolioSelectsNothing:true,
      portfolioPreregistersNothing:true,
      portfolioExecutesNothing:true,
      operatorApprovalRequiredForCampaignSelection:true,
      scientificTruth:"NOT_ESTABLISHED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function portfolioRecommendation(portfolio,programId){
  if(!verifyResearchPortfolio(portfolio)) throw new Error("Research portfolio fingerprint mismatch");
  const allocation=portfolio.allocation.allocations.find(item=>item.programId===programId);
  if(!allocation) return null;
  return clone(allocation);
}

export function createPortfolioSelectionReceipt(portfolio,programId,{
  operatorApproved=false,
  approvalReceipt=null
}={}){
  if(!verifyResearchPortfolio(portfolio)) throw new Error("Research portfolio fingerprint mismatch");
  if(operatorApproved!==true) throw new Error("Operator approval is required");
  if(typeof approvalReceipt!=="string"||!approvalReceipt.trim()){
    throw new Error("A non-empty approval receipt is required");
  }
  const allocation=portfolio.allocation.allocations.find(item=>item.programId===programId);
  if(!allocation) throw new Error("Program is not allocated in this portfolio");

  const body={
    version:"PORTFOLIO_SELECTION_RECEIPT_V0.1",
    portfolioFingerprint:portfolio.fingerprint,
    programId,
    allocationId:allocation.allocationId,
    recommendedStepId:allocation.recommendedStepId,
    operatorApproved:true,
    approvalReceipt:approvalReceipt.trim(),
    campaignSelectionAuthorized:true,
    experimentExecutionAuthorized:false
  };
  return {...body,fingerprint:fingerprint(body)};
}
