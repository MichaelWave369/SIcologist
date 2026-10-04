import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  createResearchCampaignPlan,
  verifyResearchCampaignPlan,
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

  const bindings=[
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

  return {claims,target,rivalA,rivalB,bindings};
}

function planFixture(policy={maxSteps:3,maxEstimatedCost:2}){
  const base=setup();
  const plan=createResearchCampaignPlan(base.claims,{
    targetClaimId:base.target.claimId,
    rivals:base.bindings,
    policy,
    title:"SC-007 falsification campaign"
  });
  return {...base,plan};
}

function outcomeLabel(contract,outcome){
  return Object.entries(contract.decisionTable).find(([,value])=>value===outcome)?.[0];
}

test("campaign plan is deterministic, fingerprinted, and budget bounded",()=>{
  const a=planFixture();
  const b=planFixture();

  assert.equal(verifyResearchCampaignPlan(a.plan),true);
  assert.equal(a.plan.fingerprint,b.plan.fingerprint);
  assert.ok(a.plan.steps.length<=3);
  assert.ok(a.plan.planning.plannedEstimatedCost<=2);
  assert.equal(a.plan.boundaries.planExecutesNothing,true);
  assert.equal(a.plan.boundaries.planPreregistersNothing,true);
});

test("campaign tries rival coverage before adding extra candidates",()=>{
  const {plan,rivalA,rivalB}=planFixture({maxSteps:3,maxEstimatedCost:2});
  const firstTwo=new Set(plan.steps.slice(0,2).map(step=>step.rivalClaimId));
  assert.equal(firstTwo.size,2);
  assert.ok(firstTwo.has(rivalA.claimId));
  assert.ok(firstTwo.has(rivalB.claimId));
  assert.equal(plan.planning.rivalsCovered,2);
});

test("small budget can produce an empty but valid plan",()=>{
  const {claims,target,bindings}=setup();
  const plan=createResearchCampaignPlan(claims,{
    targetClaimId:target.claimId,
    rivals:bindings,
    policy:{maxSteps:3,maxEstimatedCost:.01}
  });
  assert.equal(plan.steps.length,0);
  const tracker=new ResearchCampaignTracker(plan);
  assert.equal(
    tracker.gate(claims,new ClaimChallengeRegistry()).decision,
    "STOP_NO_PLANNED_STEPS"
  );
});

test("fresh tracker begins ready for explicit operator selection",()=>{
  const {claims,plan}=planFixture();
  const challenges=new ClaimChallengeRegistry();
  const tracker=new ResearchCampaignTracker(plan);
  const gate=tracker.gate(claims,challenges);
  assert.equal(gate.decision,"READY_FOR_OPERATOR_SELECTION");
  assert.equal(gate.executionAuthorized,false);
  assert.equal(gate.operatorActionRequired,true);
  assert.equal(gate.detail.nextStep.stepNumber,1);
});

test("campaign selection requires operator approval and creates no execution authority",()=>{
  const {claims,plan}=planFixture();
  const challenges=new ClaimChallengeRegistry();
  const tracker=new ResearchCampaignTracker(plan);

  assert.throws(()=>tracker.selectNext({
    claimRegistry:claims,
    challengeRegistry:challenges
  }),/Operator approval/);

  const selection=tracker.selectNext({
    claimRegistry:claims,
    challengeRegistry:challenges,
    operatorApproved:true,
    approvalReceipt:"operator:campaign:step1"
  });
  assert.equal(selection.executionAuthorized,false);
  assert.equal(challenges.export().contracts.length,1);
});

test("tracker waits for result then waits for evidence attachment",()=>{
  const {claims,plan}=planFixture();
  const challenges=new ClaimChallengeRegistry();
  const tracker=new ResearchCampaignTracker(plan);
  const selection=tracker.selectNext({
    claimRegistry:claims,
    challengeRegistry:challenges,
    operatorApproved:true,
    approvalReceipt:"operator:step1"
  });

  assert.equal(tracker.gate(claims,challenges).decision,"WAIT_CHALLENGE_RESULT");

  const contract=challenges.contract(selection.challengeContractId);
  const label=outcomeLabel(contract,"SURVIVED_CHALLENGE");
  challenges.recordResult(claims,selection.challengeContractId,{
    observationLabel:label,
    evidenceArtifact:artifact({run:"step1",outcome:"survived"}),
    evaluatorId:"evaluator-a"
  });

  assert.equal(tracker.gate(claims,challenges).decision,"WAIT_RESULT_ATTACHMENT");

  challenges.attachResultToTargetClaim(claims,selection.challengeContractId);
  const gate=tracker.gate(claims,challenges);
  assert.ok(["READY_FOR_OPERATOR_SELECTION","STOP_PLAN_COMPLETE"].includes(gate.decision));
});

test("contradicted challenge stops campaign after result is attached",()=>{
  const {claims,plan}=planFixture();
  const challenges=new ClaimChallengeRegistry();
  const tracker=new ResearchCampaignTracker(plan);
  const selection=tracker.selectNext({
    claimRegistry:claims,
    challengeRegistry:challenges,
    operatorApproved:true,
    approvalReceipt:"operator:step1"
  });
  const contract=challenges.contract(selection.challengeContractId);
  const label=outcomeLabel(contract,"CONTRADICTED");

  challenges.recordResult(claims,selection.challengeContractId,{
    observationLabel:label,
    evidenceArtifact:artifact({run:"step1",outcome:"contradicted"}),
    evaluatorId:"evaluator-a"
  });
  challenges.attachResultToTargetClaim(claims,selection.challengeContractId);

  assert.equal(
    tracker.gate(claims,challenges).decision,
    "STOP_CHALLENGE_CONTRADICTED"
  );
});

test("superseding target claim stops campaign",()=>{
  const {claims,target,plan}=planFixture();
  const tracker=new ResearchCampaignTracker(plan);
  const challenges=new ClaimChallengeRegistry();
  claims.reviseClaim(target.claimId,{
    statement:"Narrower revised target.",
    reason:"new scope"
  });
  assert.equal(
    tracker.gate(claims,challenges).decision,
    "STOP_TARGET_SUPERSEDED"
  );
});

test("superseding next rival makes the frozen plan stale",()=>{
  const {claims,rivalA,rivalB,plan}=planFixture();
  const tracker=new ResearchCampaignTracker(plan);
  const challenges=new ClaimChallengeRegistry();
  const next=plan.steps[0];
  const rival=next.rivalClaimId===rivalA.claimId?rivalA:rivalB;

  claims.reviseClaim(rival.claimId,{
    statement:"Revised rival.",
    reason:"new evidence changed the rival statement"
  });

  assert.equal(
    tracker.gate(claims,challenges).decision,
    "STOP_PLAN_STALE"
  );
});

test("contested target evidence escalates before selection",()=>{
  const {claims,target,plan}=planFixture();
  claims.registerEvidence({
    claimId:target.claimId,
    evidenceType:"EXTERNAL_REFERENCE",
    relation:"SUPPORTS",
    artifactFingerprint:"a".repeat(64)
  });
  claims.registerEvidence({
    claimId:target.claimId,
    evidenceType:"EXTERNAL_REFERENCE",
    relation:"CONTRADICTS",
    artifactFingerprint:"b".repeat(64)
  });

  const tracker=new ResearchCampaignTracker(plan);
  const gate=tracker.gate(claims,new ClaimChallengeRegistry());
  assert.equal(gate.decision,"ESCALATE_CONTESTED");
  assert.equal(gate.operatorActionRequired,true);
});

test("all planned steps can complete only through repeated checkpoints",()=>{
  const {claims,plan}=planFixture({maxSteps:2,maxEstimatedCost:2});
  const challenges=new ClaimChallengeRegistry();
  const tracker=new ResearchCampaignTracker(plan);

  for(let i=0;i<plan.steps.length;i++){
    assert.equal(tracker.gate(claims,challenges).decision,"READY_FOR_OPERATOR_SELECTION");
    const selection=tracker.selectNext({
      claimRegistry:claims,
      challengeRegistry:challenges,
      operatorApproved:true,
      approvalReceipt:"operator:step:"+(i+1)
    });
    const contract=challenges.contract(selection.challengeContractId);
    const label=outcomeLabel(contract,"INCONCLUSIVE");
    challenges.recordResult(claims,selection.challengeContractId,{
      observationLabel:label,
      evidenceArtifact:artifact({step:i+1,result:"inconclusive"}),
      evaluatorId:"evaluator-a"
    });
    challenges.attachResultToTargetClaim(claims,selection.challengeContractId);
  }

  assert.equal(tracker.gate(claims,challenges).decision,"STOP_PLAN_COMPLETE");
});

test("tampered plan cannot initialize a tracker",()=>{
  const {plan}=planFixture();
  plan.planning.plannedEstimatedCost=999;
  assert.throws(()=>new ResearchCampaignTracker(plan),/fingerprint mismatch/);
});

test("tracker export and restore are deterministic",()=>{
  const {claims,plan}=planFixture();
  const challenges=new ClaimChallengeRegistry();
  const tracker=new ResearchCampaignTracker(plan);
  tracker.selectNext({
    claimRegistry:claims,
    challengeRegistry:challenges,
    operatorApproved:true,
    approvalReceipt:"operator:restore"
  });

  const snapshot=tracker.export();
  const restored=ResearchCampaignTracker.fromSnapshot(snapshot);
  assert.deepEqual(restored.export(),snapshot);
  assert.deepEqual(restored.selections(),tracker.selections());
});

test("duplicate rival bindings are rejected",()=>{
  const {claims,target,rivalA}=setup();
  const binding={
    rivalClaimId:rivalA.claimId,
    conditionId:"SC-007",
    targetHypothesisId:"H-SC-007-01",
    rivalHypothesisId:"H-SC-007-02"
  };
  assert.throws(()=>createResearchCampaignPlan(claims,{
    targetClaimId:target.claimId,
    rivals:[binding,binding]
  }),/Duplicate rivalClaimId/);
});
