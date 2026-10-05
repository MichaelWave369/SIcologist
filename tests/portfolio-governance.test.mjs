import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  PortfolioGovernanceRegistry,
  createResearchCampaignPlan,
  createResearchPortfolio,
  createPortfolioSelectionReceipt,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

function setup(count=3){
  const claims=new ClaimEvidenceRegistry();
  const challenges=new ClaimChallengeRegistry();
  const trackers=new Map();
  const programs=[];

  for(let i=1;i<=count;i++){
    const target=claims.createClaim({
      claimKey:"P"+i+"_TARGET",
      statement:"Program "+i+" target.",
      scope:{conditionId:"SC-007"}
    });
    const rival=claims.createClaim({
      claimKey:"P"+i+"_RIVAL",
      statement:"Program "+i+" rival.",
      scope:{conditionId:"SC-007"}
    });
    const plan=createResearchCampaignPlan(claims,{
      targetClaimId:target.claimId,
      rivals:[{
        rivalClaimId:rival.claimId,
        conditionId:"SC-007",
        targetHypothesisId:"H-SC-007-01",
        rivalHypothesisId:"H-SC-007-02"
      }],
      policy:{maxSteps:2,maxEstimatedCost:2},
      title:"Program "+i
    });
    const tracker=new ResearchCampaignTracker(plan);
    const programId="program-"+i;
    trackers.set(programId,tracker);
    programs.push({
      programId,
      tracker,
      operatorImportance:1-(i-1)*.1
    });
  }

  const portfolio=createResearchPortfolio(claims,challenges,{
    title:"governance fixture",
    programs,
    policy:{maxAllocatedCampaigns:count,maxEstimatedCost:10}
  });

  return {claims,challenges,trackers,portfolio};
}

function labelFor(contract,outcome){
  return Object.entries(contract.decisionTable).find(([,value])=>value===outcome)?.[0];
}

function selectProgram(base,registry,programId){
  const portfolioReceipt=createPortfolioSelectionReceipt(base.portfolio,programId,{
    operatorApproved:true,
    approvalReceipt:"operator:portfolio:"+programId
  });
  const tracker=base.trackers.get(programId);
  const campaignSelection=tracker.selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:campaign:"+programId
  });
  const governanceSelection=registry.registerSelection({
    portfolio:base.portfolio,
    portfolioSelectionReceipt:portfolioReceipt,
    campaignSelection
  });
  return {portfolioReceipt,campaignSelection,governanceSelection,tracker};
}

function resolve(base,registry,selection,outcome,{attach=true}={}){
  const contract=base.challenges.contract(selection.campaignSelection.challengeContractId);
  const label=labelFor(contract,outcome);
  base.challenges.recordResult(base.claims,selection.campaignSelection.challengeContractId,{
    observationLabel:label,
    evidenceArtifact:artifact({
      programId:selection.governanceSelection.programId,
      outcome
    }),
    evaluatorId:"governance-evaluator"
  });
  if(attach){
    base.challenges.attachResultToTargetClaim(
      base.claims,
      selection.campaignSelection.challengeContractId
    );
  }
  return attach
    ?registry.recordOutcome(
      base.claims,
      base.challenges,
      selection.governanceSelection.fingerprint
    )
    :null;
}

test("governance selection verifies the portfolio-to-campaign chain",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  const selected=selectProgram(base,registry,"program-1");
  const record=selected.governanceSelection;
  assert.equal(record.programId,"program-1");
  assert.equal(record.recommendedStepId,selected.campaignSelection.stepId);
  assert.equal(record.challengeContractId,selected.campaignSelection.challengeContractId);
  assert.equal(record.executionAuthorized,false);
});

test("campaign selection from another program is rejected",()=>{
  const base=setup(2);
  const registry=new PortfolioGovernanceRegistry();

  const receipt=createPortfolioSelectionReceipt(base.portfolio,"program-1",{
    operatorApproved:true,
    approvalReceipt:"operator:p1"
  });
  const wrongSelection=base.trackers.get("program-2").selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:wrong"
  });

  assert.throws(()=>registry.registerSelection({
    portfolio:base.portfolio,
    portfolioSelectionReceipt:receipt,
    campaignSelection:wrongSelection
  }),/plan does not match/);
});

test("same allocation cannot receive duplicate governance-selection credit",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  const selected=selectProgram(base,registry,"program-1");

  assert.throws(()=>registry.registerSelection({
    portfolio:base.portfolio,
    portfolioSelectionReceipt:selected.portfolioReceipt,
    campaignSelection:selected.campaignSelection
  }),/DUPLICATE_PORTFOLIO_ALLOCATION_SELECTION/);
});

test("unresolved challenge cannot become a portfolio outcome",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  const selected=selectProgram(base,registry,"program-1");

  assert.throws(()=>registry.recordOutcome(
    base.claims,
    base.challenges,
    selected.governanceSelection.fingerprint
  ),/unresolved/);
});

test("resolved but unattached challenge cannot become a portfolio outcome",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  const selected=selectProgram(base,registry,"program-1");
  resolve(base,registry,selected,"SURVIVED_CHALLENGE",{attach:false});

  assert.throws(()=>registry.recordOutcome(
    base.claims,
    base.challenges,
    selected.governanceSelection.fingerprint
  ),/not attached/);
});

test("completed outcome records claim transition and descriptive boundaries",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  const selected=selectProgram(base,registry,"program-1");
  const outcome=resolve(base,registry,selected,"SURVIVED_CHALLENGE");

  assert.equal(outcome.challengeOutcome,"SURVIVED_CHALLENGE");
  assert.equal(outcome.decisionYield,"DECISIVE");
  assert.equal(outcome.evidenceAttached,true);
  assert.equal(outcome.claimTransition.before.status,"UNASSESSED");
  assert.equal(outcome.claimTransition.after.status,"SUPPORT_ONLY");
  assert.equal(outcome.boundaries.allocationEffectCausality,"NOT_ESTABLISHED");
  assert.equal(outcome.boundaries.priorityPolicyValidated,false);
});

test("one selection can produce only one governance outcome",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  const selected=selectProgram(base,registry,"program-1");
  resolve(base,registry,selected,"SURVIVED_CHALLENGE");

  assert.throws(()=>registry.recordOutcome(
    base.claims,
    base.challenges,
    selected.governanceSelection.fingerprint
  ),/PORTFOLIO_OUTCOME_ALREADY_RECORDED/);
});

test("summary keeps pending and completed allocations separate",()=>{
  const base=setup(2);
  const registry=new PortfolioGovernanceRegistry();
  const first=selectProgram(base,registry,"program-1");
  selectProgram(base,registry,"program-2");
  resolve(base,registry,first,"WEAKENED");

  const summary=registry.summary();
  assert.equal(summary.selectionCount,2);
  assert.equal(summary.completedOutcomeCount,1);
  assert.equal(summary.pendingOutcomeCount,1);
  assert.equal(summary.completionRate,.5);
  assert.equal(summary.outcomeCounts.WEAKENED,1);
  assert.equal(summary.pendingSelections.length,1);
});

test("inconclusive challenge is not counted as decisive",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  const selected=selectProgram(base,registry,"program-1");
  const outcome=resolve(base,registry,selected,"INCONCLUSIVE");

  assert.equal(outcome.decisionYield,"INCONCLUSIVE");
  const summary=registry.summary();
  assert.equal(summary.decisiveOutcomeCount,0);
  assert.equal(summary.decisiveRate,0);
  assert.equal(summary.inconclusiveRate,1);
});

test("review flags high inconclusive rate without changing policy",()=>{
  const base=setup(3);
  const registry=new PortfolioGovernanceRegistry();
  for(const id of ["program-1","program-2","program-3"]){
    const selected=selectProgram(base,registry,id);
    resolve(base,registry,selected,"INCONCLUSIVE");
  }

  const review=registry.governanceReview();
  assert.ok(review.flags.some(item=>item.flag==="HIGH_INCONCLUSIVE_RATE"));
  assert.equal(review.reviewStatus,"HUMAN_POLICY_REVIEW_REQUIRED");
  assert.equal(review.automaticWeightUpdate,false);
  assert.equal(review.automaticBudgetUpdate,false);
  assert.equal(review.automaticExecutionChange,false);
  assert.equal(review.policyRecommendation,"DESCRIPTIVE_REVIEW_ONLY");
});

test("review can flag high contradiction rate without calling it policy failure",()=>{
  const base=setup(3);
  const registry=new PortfolioGovernanceRegistry({
    policy:{maxContradictionRate:.5}
  });
  for(const id of ["program-1","program-2","program-3"]){
    const selected=selectProgram(base,registry,id);
    resolve(base,registry,selected,"CONTRADICTED");
  }

  const review=registry.governanceReview();
  assert.ok(review.flags.some(item=>item.flag==="HIGH_CONTRADICTION_RATE"));
  assert.equal(review.boundaries.correlationIsNotPolicyCausation,true);
  assert.equal(review.boundaries.completedOutcomesDoNotValidateWeights,true);
});

test("pending outcome produces an informational governance flag",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  selectProgram(base,registry,"program-1");
  const review=registry.governanceReview();

  const flag=review.flags.find(item=>item.flag==="PENDING_OUTCOMES_PRESENT");
  assert.equal(flag.severity,"INFO");
  assert.equal(review.reviewStatus,"NO_AUTOMATIC_POLICY_CHANGE");
});

test("registry export and restore are deterministic",()=>{
  const base=setup(2);
  const registry=new PortfolioGovernanceRegistry();
  const first=selectProgram(base,registry,"program-1");
  selectProgram(base,registry,"program-2");
  resolve(base,registry,first,"SURVIVED_CHALLENGE");

  const snapshot=registry.export();
  const restored=PortfolioGovernanceRegistry.fromSnapshot(snapshot);
  assert.deepEqual(restored.export(),snapshot);
  assert.deepEqual(restored.summary(),registry.summary());
  assert.deepEqual(restored.governanceReview(),registry.governanceReview());
});

test("tampered governance registry snapshot is rejected",()=>{
  const base=setup(1);
  const registry=new PortfolioGovernanceRegistry();
  selectProgram(base,registry,"program-1");
  const snapshot=registry.export();
  snapshot.selections[0].allocatedPriorityScore=1;

  assert.throws(
    ()=>PortfolioGovernanceRegistry.fromSnapshot(snapshot),
    /fingerprint mismatch/
  );
});

test("invalid governance policy thresholds are rejected",()=>{
  assert.throws(
    ()=>new PortfolioGovernanceRegistry({
      policy:{maxInconclusiveRate:1.5}
    }),
    /must be in \[0,1\]/
  );
});
