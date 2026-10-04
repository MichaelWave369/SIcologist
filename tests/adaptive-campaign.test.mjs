import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  createResearchCampaignPlan,
  createAdaptiveCampaignRevision,
  activateAdaptiveCampaignRevision,
  adaptiveCampaignLineage,
  verifyAdaptiveCampaignRevision,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

function setup(){
  const claims=new ClaimEvidenceRegistry();
  const target=claims.createClaim({
    claimKey:"TARGET",
    statement:"External tool failure best explains the retry spiral.",
    scope:{conditionId:"SC-007"}
  });
  const rivalA=claims.createClaim({
    claimKey:"RIVAL_A",
    statement:"Retry policy failure best explains the retry spiral.",
    scope:{conditionId:"SC-007"}
  });
  const rivalB=claims.createClaim({
    claimKey:"RIVAL_B",
    statement:"Runtime adapter failure best explains the retry spiral.",
    scope:{conditionId:"SC-007"}
  });

  const rivals=[
    {
      rivalClaimId:rivalA.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-02",
      boundaryConditions:["same task","same role"]
    },
    {
      rivalClaimId:rivalB.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-03",
      boundaryConditions:["same task","same role"]
    }
  ];

  const plan=createResearchCampaignPlan(claims,{
    targetClaimId:target.claimId,
    rivals,
    policy:{maxSteps:3,maxEstimatedCost:2},
    title:"adaptive fixture"
  });
  const challenges=new ClaimChallengeRegistry();
  const tracker=new ResearchCampaignTracker(plan);

  return {claims,target,rivalA,rivalB,rivals,plan,challenges,tracker};
}

function labelFor(contract,outcome){
  return Object.entries(contract.decisionTable).find(([,value])=>value===outcome)?.[0];
}

function completeNext(base,outcome="SURVIVED_CHALLENGE"){
  const selection=base.tracker.selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:complete:"+base.tracker.selections().length
  });
  const contract=base.challenges.contract(selection.challengeContractId);
  const label=labelFor(contract,outcome);
  base.challenges.recordResult(base.claims,selection.challengeContractId,{
    observationLabel:label,
    evidenceArtifact:artifact({
      challenge:selection.challengeContractId,
      outcome
    }),
    evaluatorId:"evaluator-a"
  });
  base.challenges.attachResultToTargetClaim(
    base.claims,
    selection.challengeContractId
  );
  return selection;
}

test("adaptive revision preserves prior plan and creates a new fingerprinted plan",()=>{
  const base=setup();
  const original=structuredClone(base.plan);
  const selection=completeNext(base);

  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"First challenge completed; recalculate remaining research order."
  });

  assert.equal(verifyAdaptiveCampaignRevision(revision),true);
  assert.equal(revision.revisionNumber,2);
  assert.equal(revision.supersedesPlanFingerprint,base.plan.fingerprint);
  assert.notEqual(revision.nextPlan.fingerprint,base.plan.fingerprint);
  assert.deepEqual(base.tracker.plan(),original);
  assert.equal(revision.activation.status,"NOT_ACTIVATED");
  assert.equal(revision.activation.executionAuthorized,false);
  assert.equal(revision.triggers.completedChallengeOutcomes.length,1);
  assert.equal(revision.triggers.completedChallengeOutcomes[0].stepId,selection.stepId);
});

test("completed rival/probe candidate is retired by default",()=>{
  const base=setup();
  const selection=completeNext(base);
  const completedStep=base.plan.steps.find(step=>step.stepId===selection.stepId);

  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Retire completed experiment."
  });

  assert.ok(revision.retiredCompletedCandidates.some(item=>
    item.rivalClaimKey===completedStep.rivalClaimKey&&
    item.probeId===completedStep.probeId
  ));
  assert.ok(revision.nextPlan.exclusions.some(item=>
    item.rivalClaimKey===completedStep.rivalClaimKey&&
    item.probeId===completedStep.probeId
  ));
  assert.equal(revision.nextPlan.steps.some(step=>
    step.rivalClaimKey===completedStep.rivalClaimKey&&
    step.probeId===completedStep.probeId
  ),false);
});

test("explicit retest override is recorded",()=>{
  const base=setup();
  completeNext(base);
  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Operator wants retest to remain eligible.",
    allowRetestCompleted:true
  });
  assert.equal(revision.allowRetestCompleted,true);
  assert.equal(revision.retiredCompletedCandidates.length,0);
  assert.equal(revision.nextPlan.exclusions.length,0);
});

test("cannot adapt while selected challenge is unresolved",()=>{
  const base=setup();
  base.tracker.selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:unresolved"
  });

  assert.throws(()=>createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Too early."
  }),/unresolved/);
});

test("cannot adapt before a resolved result is attached",()=>{
  const base=setup();
  const selection=base.tracker.selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:unattached"
  });
  const contract=base.challenges.contract(selection.challengeContractId);
  base.challenges.recordResult(base.claims,selection.challengeContractId,{
    observationLabel:labelFor(contract,"SURVIVED_CHALLENGE"),
    evidenceArtifact:artifact({result:"survived"}),
    evaluatorId:"evaluator-a"
  });

  assert.throws(()=>createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Still too early."
  }),/attached/);
});

test("no evidence or revision change means no adaptive revision",()=>{
  const base=setup();
  assert.throws(()=>createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Nothing actually changed."
  }),/NO_NEW_EVIDENCE_OR_REVISION_FOR_REPLAN/);
});

test("revised target claim is rebound into the new campaign",()=>{
  const base=setup();
  completeNext(base);
  const revised=base.claims.reviseClaim(base.target.claimId,{
    statement:"External tool failure explains the retry spiral inside the browser-tool scope.",
    scope:{conditionId:"SC-007"},
    reason:"Narrow scope after challenge."
  });

  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Target claim was narrowed."
  });

  assert.equal(revision.triggers.targetRevisionChanged,true);
  assert.equal(revision.nextPlan.target.claimId,revised.claimId);
  assert.equal(revision.assessmentTransition.currentClaimId,revised.claimId);
  assert.equal(revision.assessmentTransition.currentStatus,"UNASSESSED");
});

test("revised rival is rebound and recorded",()=>{
  const base=setup();
  completeNext(base);
  const revised=base.claims.reviseClaim(base.rivalB.claimId,{
    statement:"Runtime adapter failure explains retry behavior only under remote adapters.",
    scope:{conditionId:"SC-007"},
    reason:"Narrow rival."
  });

  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Rival statement changed."
  });

  assert.ok(revision.triggers.rivalRevisionChanges.some(item=>
    item.claimKey==="RIVAL_B"&&item.currentClaimId===revised.claimId
  ));
  assert.ok(revision.nextPlan.stressReports.some(report=>
    report.rival.claimKey==="RIVAL_B"&&report.rival.claimId===revised.claimId
  ));
});

test("explicitly retired rival is omitted without being labeled disproven",()=>{
  const base=setup();
  completeNext(base);
  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Defer runtime-adapter rival to another campaign.",
    retireRivalKeys:["RIVAL_B"]
  });

  assert.deepEqual(revision.triggers.explicitlyRetiredRivalKeys,["RIVAL_B"]);
  assert.equal(revision.nextPlan.stressReports.some(report=>
    report.rival.claimKey==="RIVAL_B"
  ),false);
});

test("contested or contradicted target recommends review but does not self-activate",()=>{
  const base=setup();
  completeNext(base,"CONTRADICTED");

  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Challenge contradicted target; inspect alternative campaign."
  });

  assert.ok(["CONTRADICTED","CONTESTED"].includes(
    revision.assessmentTransition.currentStatus
  ));
  assert.equal(revision.activation.reviewRecommended,true);
  assert.equal(revision.activation.status,"NOT_ACTIVATED");
});

test("activation requires explicit operator approval and creates fresh tracker",()=>{
  const base=setup();
  completeNext(base);
  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Refresh remaining plan."
  });

  assert.throws(()=>activateAdaptiveCampaignRevision(revision),/Operator approval/);

  const activated=activateAdaptiveCampaignRevision(revision,{
    operatorApproved:true,
    approvalReceipt:"operator:activate:v2"
  });
  assert.equal(activated.activationReceipt.activated,true);
  assert.equal(activated.activationReceipt.executionAuthorized,false);
  assert.deepEqual(activated.tracker.plan(),revision.nextPlan);
  assert.equal(activated.tracker.selections().length,0);
});

test("tampered adaptive revision cannot be activated",()=>{
  const base=setup();
  completeNext(base);
  const revision=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Tamper fixture."
  });
  revision.planDiff.newStepCount=999;
  assert.throws(()=>activateAdaptiveCampaignRevision(revision,{
    operatorApproved:true,
    approvalReceipt:"operator:tampered"
  }),/fingerprint mismatch/);
});

test("v2 to v3 lineage is continuous and fingerprinted",()=>{
  const base=setup();
  completeNext(base);
  const v2=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:base.tracker,
    revisionReason:"Create v2."
  });
  const activeV2=activateAdaptiveCampaignRevision(v2,{
    operatorApproved:true,
    approvalReceipt:"operator:v2"
  });
  const baseV2={
    ...base,
    plan:v2.nextPlan,
    tracker:activeV2.tracker
  };
  completeNext(baseV2,"INCONCLUSIVE");

  const v3=createAdaptiveCampaignRevision(base.claims,base.challenges,{
    priorTracker:activeV2.tracker,
    priorRevision:v2,
    revisionReason:"Second checkpoint changed research order."
  });

  assert.equal(v3.revisionNumber,3);
  assert.equal(v3.supersedesRevisionFingerprint,v2.fingerprint);
  assert.equal(v3.rootPlanFingerprint,v2.rootPlanFingerprint);

  const lineage=adaptiveCampaignLineage([v3,v2]);
  assert.equal(lineage.revisionCount,2);
  assert.equal(lineage.revisions[0].revisionNumber,2);
  assert.equal(lineage.revisions[1].revisionNumber,3);
});

test("prior revision must own the supplied prior tracker plan",()=>{
  const a=setup();
  completeNext(a);
  const v2=createAdaptiveCampaignRevision(a.claims,a.challenges,{
    priorTracker:a.tracker,
    revisionReason:"v2"
  });

  const b=setup();
  completeNext(b);

  assert.throws(()=>createAdaptiveCampaignRevision(b.claims,b.challenges,{
    priorTracker:b.tracker,
    priorRevision:v2,
    revisionReason:"wrong lineage"
  }),/does not own/);
});

test("campaign exclusions reject duplicate rival/probe pairs",()=>{
  const base=setup();
  assert.throws(()=>createResearchCampaignPlan(base.claims,{
    targetClaimId:base.target.claimId,
    rivals:base.rivals,
    exclusions:[
      {rivalClaimKey:"RIVAL_A",probeId:"known_good_fixture"},
      {rivalClaimKey:"RIVAL_A",probeId:"known_good_fixture"}
    ]
  }),/Duplicate campaign exclusion/);
});
