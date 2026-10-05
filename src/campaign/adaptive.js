import {fingerprint} from "../experiment/fingerprint.js";
import {
  ResearchCampaignTracker,
  createResearchCampaignPlan,
  verifyResearchCampaignPlan
} from "./planner.js";

export const ADAPTIVE_CAMPAIGN_VERSION="ADAPTIVE_CAMPAIGN_REVISION_V0.1";

function clone(value){ return structuredClone(value); }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function trackerSnapshot(value){
  const snapshot=typeof value?.export==="function"?value.export():value;
  if(snapshot?.version!=="RESEARCH_CAMPAIGN_TRACKER_V0.1"||!verifyFingerprint(snapshot)){
    throw new Error("Prior campaign tracker fingerprint mismatch");
  }
  ResearchCampaignTracker.fromSnapshot(snapshot);
  return clone(snapshot);
}

function currentByKey(claimRegistry,claimKey,label){
  if(!claimRegistry||typeof claimRegistry.latest!=="function"){
    throw new TypeError("claimRegistry with latest() is required");
  }
  const claim=claimRegistry.latest(claimKey);
  if(!claim) throw new Error("No current "+label+" claim for key "+claimKey);
  if(claim.supersededBy) throw new Error(label+" latest claim is unexpectedly superseded");
  return claim;
}

function cleanKeys(values=[]){
  if(!Array.isArray(values)) throw new TypeError("retireRivalKeys must be an array");
  return [...new Set(
    values
      .filter(value=>typeof value==="string"&&value.trim())
      .map(value=>value.trim())
  )].sort();
}

function completedOutcomes(claimRegistry,challengeRegistry,snapshot){
  const records=[];
  for(const selection of snapshot.selections??[]){
    const result=challengeRegistry.result(selection.challengeContractId);
    if(!result){
      throw new Error("Cannot adapt while a selected challenge is unresolved");
    }
    const attached=claimRegistry
      .evidenceFor(snapshot.plan.target.claimId)
      .some(item=>
        item.evidenceType==="CLAIM_CHALLENGE_RESULT"&&
        item.artifactFingerprint===result.fingerprint
      );
    if(!attached){
      throw new Error("Cannot adapt before the completed challenge result is attached");
    }
    const step=snapshot.plan.steps.find(item=>item.stepId===selection.stepId);
    if(!step) throw new Error("Prior selection references an unknown campaign step");
    records.push({
      stepNumber:selection.stepNumber,
      stepId:selection.stepId,
      rivalClaimId:step.rivalClaimId,
      rivalClaimKey:step.rivalClaimKey,
      probeId:step.probeId,
      challengeContractId:selection.challengeContractId,
      resultFingerprint:result.fingerprint,
      outcome:result.outcome
    });
  }
  return records.sort((a,b)=>a.stepNumber-b.stepNumber);
}

function deriveBindings(claimRegistry,priorPlan,retiredRivalKeys){
  const retired=new Set(retiredRivalKeys);
  return priorPlan.stressReports
    .filter(report=>!retired.has(report.rival.claimKey))
    .map(report=>{
      const rival=currentByKey(claimRegistry,report.rival.claimKey,"rival");
      const targetPriors=report.pairPriors?.[report.target.hypothesisId];
      const rivalPriors=report.pairPriors?.[report.rival.hypothesisId];
      return {
        rivalClaimId:rival.claimId,
        conditionId:report.conditionId,
        targetHypothesisId:report.target.hypothesisId,
        rivalHypothesisId:report.rival.hypothesisId,
        priors:{
          target:targetPriors,
          rival:rivalPriors
        },
        weights:clone(report.scoring.weights),
        costOverrides:Object.fromEntries(
          report.candidates.map(candidate=>[
            candidate.probeId,
            candidate.metrics.estimatedCost
          ])
        ),
        boundaryConditions:[
          ...(report.recommendation?.generatedContract?.boundaryConditions??[])
        ]
      };
    });
}

function stepIdentity(step){
  return step.rivalClaimKey+":"+step.probeId;
}

function diffPlans(priorPlan,nextPlan,completedCount){
  const oldRemaining=priorPlan.steps.slice(completedCount);
  const oldKeys=new Set(oldRemaining.map(stepIdentity));
  const newKeys=new Set(nextPlan.steps.map(stepIdentity));
  return {
    oldRemainingStepCount:oldRemaining.length,
    newStepCount:nextPlan.steps.length,
    carriedForward:nextPlan.steps
      .filter(step=>oldKeys.has(stepIdentity(step)))
      .map(step=>stepIdentity(step))
      .sort(),
    added:nextPlan.steps
      .filter(step=>!oldKeys.has(stepIdentity(step)))
      .map(step=>stepIdentity(step))
      .sort(),
    retiredFromOldPlan:oldRemaining
      .filter(step=>!newKeys.has(stepIdentity(step)))
      .map(step=>stepIdentity(step))
      .sort()
  };
}

function revisionNumber(priorRevision){
  if(priorRevision===null) return 2;
  if(
    priorRevision?.version!==ADAPTIVE_CAMPAIGN_VERSION||
    !verifyFingerprint(priorRevision)
  ){
    throw new Error("Prior adaptive revision fingerprint mismatch");
  }
  return priorRevision.revisionNumber+1;
}

export function verifyAdaptiveCampaignRevision(value){
  return Boolean(value?.version===ADAPTIVE_CAMPAIGN_VERSION&&verifyFingerprint(value));
}

export function createAdaptiveCampaignRevision(claimRegistry,challengeRegistry,{
  priorTracker,
  priorRevision=null,
  revisionReason,
  retireRivalKeys=[],
  policy=null,
  title=null,
  allowRetestCompleted=false
}){
  if(typeof revisionReason!=="string"||!revisionReason.trim()){
    throw new TypeError("revisionReason is required");
  }
  if(typeof allowRetestCompleted!=="boolean"){
    throw new TypeError("allowRetestCompleted must be boolean");
  }

  const snapshot=trackerSnapshot(priorTracker);
  const priorPlan=snapshot.plan;
  if(!verifyResearchCampaignPlan(priorPlan)){
    throw new Error("Prior campaign plan fingerprint mismatch");
  }
  if(
    priorRevision!==null&&
    priorRevision.nextPlan?.fingerprint!==priorPlan.fingerprint
  ){
    throw new Error("Prior revision does not own the supplied prior tracker plan");
  }

  const outcomes=completedOutcomes(claimRegistry,challengeRegistry,snapshot);
  const retiredKeys=cleanKeys(retireRivalKeys);
  const latestTarget=currentByKey(claimRegistry,priorPlan.target.claimKey,"target");
  const currentAssessment=claimRegistry.assessClaim(latestTarget.claimId);

  const targetChanged=latestTarget.claimId!==priorPlan.target.claimId;
  const rivalChanges=priorPlan.stressReports
    .map(report=>{
      const latest=currentByKey(claimRegistry,report.rival.claimKey,"rival");
      return {
        claimKey:report.rival.claimKey,
        priorClaimId:report.rival.claimId,
        priorRevision:report.rival.revision,
        currentClaimId:latest.claimId,
        currentRevision:latest.revision,
        changed:latest.claimId!==report.rival.claimId
      };
    })
    .filter(item=>item.changed);

  if(!outcomes.length&&!targetChanged&&!rivalChanges.length&&!retiredKeys.length){
    throw new Error("NO_NEW_EVIDENCE_OR_REVISION_FOR_REPLAN");
  }

  const bindings=deriveBindings(claimRegistry,priorPlan,retiredKeys);
  if(!bindings.length) throw new Error("No unresolved rivals remain for adaptive replanning");

  const exclusions=allowRetestCompleted?[]:outcomes.map(item=>({
    rivalClaimKey:item.rivalClaimKey,
    probeId:item.probeId,
    reason:"Completed in superseded campaign step "+item.stepNumber
  }));

  const nextPlan=createResearchCampaignPlan(claimRegistry,{
    targetClaimId:latestTarget.claimId,
    rivals:bindings,
    policy:policy??priorPlan.policy,
    title:title??(priorPlan.title?priorPlan.title+" | adaptive":"Adaptive research campaign"),
    exclusions
  });

  const nextRevisionNumber=revisionNumber(priorRevision);
  const rootPlanFingerprint=priorRevision?.rootPlanFingerprint??priorPlan.fingerprint;
  const body={
    version:ADAPTIVE_CAMPAIGN_VERSION,
    revisionNumber:nextRevisionNumber,
    rootPlanFingerprint,
    supersedesPlanFingerprint:priorPlan.fingerprint,
    supersedesRevisionFingerprint:priorRevision?.fingerprint??null,
    priorTrackerFingerprint:snapshot.fingerprint,
    revisionReason:revisionReason.trim(),
    triggers:{
      completedChallengeOutcomes:outcomes,
      targetRevisionChanged:targetChanged,
      rivalRevisionChanges:rivalChanges,
      explicitlyRetiredRivalKeys:retiredKeys
    },
    assessmentTransition:{
      priorClaimId:priorPlan.target.claimId,
      priorAssessmentFingerprint:priorPlan.initialAssessment.fingerprint,
      priorStatus:priorPlan.initialAssessment.status,
      priorEvidenceGrade:priorPlan.initialAssessment.evidenceGrade,
      currentClaimId:latestTarget.claimId,
      currentAssessmentFingerprint:currentAssessment.fingerprint,
      currentStatus:currentAssessment.status,
      currentEvidenceGrade:currentAssessment.evidenceGrade
    },
    retiredCompletedCandidates:exclusions,
    allowRetestCompleted,
    planDiff:diffPlans(priorPlan,nextPlan,snapshot.selections.length),
    nextPlan,
    activation:{
      status:"NOT_ACTIVATED",
      operatorApprovalRequired:true,
      reviewRecommended:["CONTESTED","CONTRADICTED"].includes(currentAssessment.status),
      executionAuthorized:false
    },
    boundaries:{
      priorPlanImmutable:true,
      nextPlanIsNewArtifact:true,
      noAutomaticActivation:true,
      noAutomaticExecution:true,
      scientificTruth:"NOT_ESTABLISHED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function activateAdaptiveCampaignRevision(revision,{
  operatorApproved=false,
  approvalReceipt=null
}={}){
  if(!verifyAdaptiveCampaignRevision(revision)){
    throw new Error("Adaptive campaign revision fingerprint mismatch");
  }
  if(operatorApproved!==true) throw new Error("Operator approval is required");
  if(typeof approvalReceipt!=="string"||!approvalReceipt.trim()){
    throw new Error("A non-empty approval receipt is required");
  }

  const receiptBody={
    version:"ADAPTIVE_CAMPAIGN_ACTIVATION_V0.1",
    revisionFingerprint:revision.fingerprint,
    revisionNumber:revision.revisionNumber,
    nextPlanFingerprint:revision.nextPlan.fingerprint,
    operatorApproved:true,
    approvalReceipt:approvalReceipt.trim(),
    activated:true,
    executionAuthorized:false
  };
  const activationReceipt={...receiptBody,fingerprint:fingerprint(receiptBody)};
  return {
    activationReceipt,
    tracker:new ResearchCampaignTracker(revision.nextPlan)
  };
}

export function adaptiveCampaignLineage(revisions){
  if(!Array.isArray(revisions)||!revisions.length) throw new TypeError("revisions must be a non-empty array");
  const verified=revisions.map(item=>{
    if(!verifyAdaptiveCampaignRevision(item)){
      throw new Error("Adaptive campaign revision fingerprint mismatch");
    }
    return clone(item);
  }).sort((a,b)=>a.revisionNumber-b.revisionNumber);

  const root=verified[0].rootPlanFingerprint;
  for(let i=0;i<verified.length;i++){
    if(verified[i].rootPlanFingerprint!==root) throw new Error("Adaptive revisions do not share a root plan");
    if(i>0&&verified[i].supersedesRevisionFingerprint!==verified[i-1].fingerprint){
      throw new Error("Adaptive revision lineage is discontinuous");
    }
  }

  const body={
    version:"ADAPTIVE_CAMPAIGN_LINEAGE_V0.1",
    rootPlanFingerprint:root,
    revisionCount:verified.length,
    revisions:verified.map(item=>({
      revisionNumber:item.revisionNumber,
      fingerprint:item.fingerprint,
      supersedesPlanFingerprint:item.supersedesPlanFingerprint,
      supersedesRevisionFingerprint:item.supersedesRevisionFingerprint,
      nextPlanFingerprint:item.nextPlan.fingerprint,
      revisionReason:item.revisionReason
    }))
  };
  return {...body,fingerprint:fingerprint(body)};
}
