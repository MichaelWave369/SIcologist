import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  PortfolioGovernanceRegistry,
  DEFAULT_PORTFOLIO_POLICY,
  createResearchCampaignPlan,
  createResearchPortfolio,
  createPortfolioSelectionReceipt,
  createPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  createPolicyPromotionProposal,
  verifyPolicyPromotionProposal,
  activatePolicyPromotion,
  verifyPolicyActivationReceipt,
  verifyActivePolicyState,
  monitorActivePolicy,
  verifyPolicyMonitorReport,
  rollbackActivePolicy,
  verifyPolicyRollbackReceipt,
  activePolicyStateLineage,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

function candidatePolicy(){
  return {
    maxAllocatedCampaigns:1,
    maxEstimatedCost:10,
    allocationStrategy:"PRIORITY_THEN_COST_FIT",
    weights:{
      informationOpportunity:.20,
      evidenceWeakness:.20,
      replicationNeed:.15,
      operatorImportance:.35,
      costEfficiency:.10
    }
  };
}

function trialBundle(){
  const sourceGovernance=new PortfolioGovernanceRegistry();
  const review=sourceGovernance.governanceReview();
  const baseline={
    ...DEFAULT_PORTFOLIO_POLICY,
    maxAllocatedCampaigns:1,
    maxEstimatedCost:10
  };
  const revision=createPortfolioPolicyRevision({
    baselinePolicy:baseline,
    proposedPolicy:candidatePolicy(),
    governanceReview:review,
    revisionReason:"Evaluate a more operator-priority-sensitive portfolio policy."
  });
  const protocol=createProspectivePolicyTrialProtocol(revision,{
    assignmentMode:"ALTERNATING_AB",
    minRounds:2,
    operatorApproved:true,
    approvalReceipt:"operator:trial"
  });
  const summaryBody={
    version:"PROSPECTIVE_POLICY_TRIAL_SUMMARY_V0.1",
    trialProtocolFingerprint:protocol.fingerprint,
    completedRoundCount:2,
    minRoundsRequired:2,
    minRoundsMet:true,
    baseline:{
      assignedRoundCount:1,
      completedOutcomeCount:1,
      decisiveOutcomeCount:1,
      decisiveRate:1,
      inconclusiveRate:0,
      contradictionRate:0,
      outcomeCounts:{
        SURVIVED_CHALLENGE:1,
        WEAKENED:0,
        CONTRADICTED:0,
        INCONCLUSIVE:0
      }
    },
    candidate:{
      assignedRoundCount:1,
      completedOutcomeCount:1,
      decisiveOutcomeCount:1,
      decisiveRate:1,
      inconclusiveRate:0,
      contradictionRate:0,
      outcomeCounts:{
        SURVIVED_CHALLENGE:1,
        WEAKENED:0,
        CONTRADICTED:0,
        INCONCLUSIVE:0
      }
    },
    deltas:{
      decisiveRate:0,
      inconclusiveRate:0,
      contradictionRate:0
    },
    primaryMetrics:["contradictionRate","decisiveRate","inconclusiveRate"],
    evaluationStatus:"HUMAN_POLICY_REVIEW_REQUIRED",
    candidatePromotionAuthorized:false,
    automaticPolicyActivation:false,
    causalStatus:"NOT_ESTABLISHED",
    boundaries:{
      assignmentRandomized:false,
      observedOutcomeDifferencesAreNotCausalProof:true,
      humanReviewRequiredForPolicyActivation:true
    }
  };
  const summary={...summaryBody,fingerprint:fingerprint(summaryBody)};
  return {revision,protocol,summary,baseline};
}

function proposalFixture(monitoringPolicy={}){
  const bundle=trialBundle();
  const proposal=createPolicyPromotionProposal(
    bundle.revision,
    bundle.protocol,
    bundle.summary,
    {
      reviewerId:"reviewer-a",
      promotionReason:"Candidate completed the prospective review and is approved for monitored operational use.",
      riskAcceptance:"Descriptive trial differences are not treated as causal superiority.",
      monitoringPolicy
    }
  );
  return {...bundle,proposal};
}

function addGovernanceSelection({
  claims,
  challenges,
  governance,
  policy,
  id,
  outcome=null
}){
  const target=claims.createClaim({
    claimKey:id+"_TARGET",
    statement:id+" target.",
    scope:{conditionId:"SC-007"}
  });
  const rival=claims.createClaim({
    claimKey:id+"_RIVAL",
    statement:id+" rival.",
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
    policy:{maxSteps:1,maxEstimatedCost:2},
    title:id
  });
  const tracker=new ResearchCampaignTracker(plan);
  const portfolio=createResearchPortfolio(claims,challenges,{
    programs:[{programId:id,tracker,operatorImportance:.5}],
    policy
  });
  const receipt=createPortfolioSelectionReceipt(portfolio,id,{
    operatorApproved:true,
    approvalReceipt:"operator:portfolio:"+id
  });
  const campaignSelection=tracker.selectNext({
    claimRegistry:claims,
    challengeRegistry:challenges,
    operatorApproved:true,
    approvalReceipt:"operator:campaign:"+id
  });
  const selection=governance.registerSelection({
    portfolio,
    portfolioSelectionReceipt:receipt,
    campaignSelection
  });

  if(outcome===null){
    return {selection,tracker,portfolio,campaignSelection};
  }

  const contract=challenges.contract(campaignSelection.challengeContractId);
  const label=Object.entries(contract.decisionTable)
    .find(([,value])=>value===outcome)?.[0];
  if(!label) throw new Error("Fixture outcome not preregistered: "+outcome);

  challenges.recordResult(claims,campaignSelection.challengeContractId,{
    observationLabel:label,
    evidenceArtifact:artifact({id,outcome}),
    evaluatorId:"lifecycle-evaluator"
  });
  challenges.attachResultToTargetClaim(
    claims,
    campaignSelection.challengeContractId
  );
  governance.recordOutcome(
    claims,
    challenges,
    selection.fingerprint
  );
  return {selection,tracker,portfolio,campaignSelection};
}

function activatedFixture(monitoringPolicy={}){
  const {proposal,...rest}=proposalFixture(monitoringPolicy);
  const claims=new ClaimEvidenceRegistry();
  const challenges=new ClaimChallengeRegistry();
  const governance=new PortfolioGovernanceRegistry();
  const activated=activatePolicyPromotion(proposal,governance,{
    operatorApproved:true,
    approvalReceipt:"operator:activate"
  });
  return {
    ...rest,
    proposal,
    claims,
    challenges,
    governance,
    ...activated
  };
}

test("promotion proposal requires completed prospective evidence from both arms",()=>{
  const bundle=trialBundle();
  const weakBody={...bundle.summary,minRoundsMet:false,evaluationStatus:"INSUFFICIENT_PROSPECTIVE_EVIDENCE"};
  delete weakBody.fingerprint;
  const weak={...weakBody,fingerprint:fingerprint(weakBody)};

  assert.throws(()=>createPolicyPromotionProposal(
    bundle.revision,
    bundle.protocol,
    weak,
    {
      reviewerId:"reviewer-a",
      promotionReason:"too early",
      riskAcceptance:"known uncertainty"
    }
  ),/completed prospective evidence from both arms/);
});

test("promotion proposal is reviewed but not activated and preserves causal boundary",()=>{
  const {proposal}=proposalFixture();
  assert.equal(verifyPolicyPromotionProposal(proposal),true);
  assert.equal(proposal.status,"PROMOTION_REVIEWED_NOT_ACTIVATED");
  assert.equal(proposal.boundaries.candidateWasAutomaticallyPromoted,false);
  assert.equal(proposal.boundaries.causalPolicySuperiority,"NOT_ESTABLISHED");
  assert.equal(proposal.boundaries.operatorActivationRequired,true);
});

test("activation requires operator approval and preserves baseline as rollback target",()=>{
  const {proposal}=proposalFixture();
  const governance=new PortfolioGovernanceRegistry();

  assert.throws(()=>activatePolicyPromotion(proposal,governance),/Operator approval/);

  const activated=activatePolicyPromotion(proposal,governance,{
    operatorApproved:true,
    approvalReceipt:"operator:activate"
  });
  assert.equal(verifyPolicyActivationReceipt(activated.activationReceipt),true);
  assert.equal(verifyActivePolicyState(activated.state),true);
  assert.equal(activated.state.activePolicyFingerprint,proposal.candidatePolicyFingerprint);
  assert.equal(activated.state.rollbackPolicyFingerprint,proposal.baselinePolicyFingerprint);
  assert.equal(activated.state.authority.experimentExecutionAuthorized,false);
});

test("pre-activation governance evidence is excluded from post-activation monitoring",()=>{
  const {proposal}=proposalFixture({minCompletedOutcomes:1});
  const claims=new ClaimEvidenceRegistry();
  const challenges=new ClaimChallengeRegistry();
  const governance=new PortfolioGovernanceRegistry();

  addGovernanceSelection({
    claims,
    challenges,
    governance,
    policy:proposal.candidatePolicy,
    id:"pre-activation",
    outcome:"CONTRADICTED"
  });

  const {state}=activatePolicyPromotion(proposal,governance,{
    operatorApproved:true,
    approvalReceipt:"operator:activate-after-old-evidence"
  });
  const monitor=monitorActivePolicy(state,governance);
  assert.equal(verifyPolicyMonitorReport(monitor),true);
  assert.equal(monitor.postActivationSelectionCount,0);
  assert.equal(monitor.completedOutcomeCount,0);
  assert.equal(monitor.contradictionRate,0);
  assert.equal(monitor.boundaries.trialOutcomesExcludedByActivationBaseline,true);
});

test("monitor remains insufficient before minimum post-activation outcomes",()=>{
  const base=activatedFixture({minCompletedOutcomes:3});
  addGovernanceSelection({
    ...base,
    policy:base.state.activePolicy,
    id:"post-1",
    outcome:"SURVIVED_CHALLENGE"
  });
  const monitor=monitorActivePolicy(base.state,base.governance);
  assert.equal(monitor.completedOutcomeCount,1);
  assert.equal(monitor.status,"INSUFFICIENT_POST_ACTIVATION_EVIDENCE");
  assert.equal(monitor.rollbackAuthorized,false);
  assert.equal(monitor.automaticRollback,false);
});

test("healthy post-activation outcomes continue monitoring",()=>{
  const base=activatedFixture({
    minCompletedOutcomes:3,
    maxInconclusiveRate:.5,
    maxContradictionRate:.5
  });
  for(const id of ["healthy-1","healthy-2","healthy-3"]){
    addGovernanceSelection({
      ...base,
      policy:base.state.activePolicy,
      id,
      outcome:"SURVIVED_CHALLENGE"
    });
  }
  const monitor=monitorActivePolicy(base.state,base.governance);
  assert.equal(monitor.status,"CONTINUE_MONITORING");
  assert.equal(monitor.decisiveRate,1);
  assert.equal(monitor.flags.length,0);
});

test("high post-activation inconclusive rate recommends rollback review",()=>{
  const base=activatedFixture({
    minCompletedOutcomes:3,
    maxInconclusiveRate:.5,
    maxContradictionRate:1
  });
  for(const [id,outcome] of [
    ["inc-1","INCONCLUSIVE"],
    ["inc-2","INCONCLUSIVE"],
    ["inc-3","SURVIVED_CHALLENGE"]
  ]){
    addGovernanceSelection({
      ...base,
      policy:base.state.activePolicy,
      id,
      outcome
    });
  }
  const monitor=monitorActivePolicy(base.state,base.governance);
  assert.equal(monitor.status,"ROLLBACK_REVIEW_RECOMMENDED");
  assert.ok(monitor.flags.some(x=>x.flag==="HIGH_POST_ACTIVATION_INCONCLUSIVE_RATE"));
  assert.equal(monitor.automaticRollback,false);
});

test("high post-activation contradiction rate recommends rollback review",()=>{
  const base=activatedFixture({
    minCompletedOutcomes:3,
    maxInconclusiveRate:1,
    maxContradictionRate:.5
  });
  for(const [id,outcome] of [
    ["con-1","CONTRADICTED"],
    ["con-2","CONTRADICTED"],
    ["con-3","SURVIVED_CHALLENGE"]
  ]){
    addGovernanceSelection({
      ...base,
      policy:base.state.activePolicy,
      id,
      outcome
    });
  }
  const monitor=monitorActivePolicy(base.state,base.governance);
  assert.equal(monitor.status,"ROLLBACK_REVIEW_RECOMMENDED");
  assert.ok(monitor.flags.some(x=>x.flag==="HIGH_POST_ACTIVATION_CONTRADICTION_RATE"));
  assert.equal(monitor.boundaries.causalPolicyFailure,"NOT_ESTABLISHED");
});

test("pending post-activation selections remain visible",()=>{
  const base=activatedFixture({minCompletedOutcomes:3});
  addGovernanceSelection({
    ...base,
    policy:base.state.activePolicy,
    id:"pending-1",
    outcome:null
  });
  const monitor=monitorActivePolicy(base.state,base.governance);
  assert.equal(monitor.pendingOutcomeCount,1);
  assert.ok(monitor.flags.some(x=>x.flag==="PENDING_POST_ACTIVATION_OUTCOMES"));
});

test("rollback requires operator approval and exact monitored governance snapshot",()=>{
  const base=activatedFixture({minCompletedOutcomes:1,maxContradictionRate:0});
  addGovernanceSelection({
    ...base,
    policy:base.state.activePolicy,
    id:"rb-1",
    outcome:"CONTRADICTED"
  });
  const monitor=monitorActivePolicy(base.state,base.governance);

  assert.throws(()=>rollbackActivePolicy(
    base.state,
    monitor,
    base.governance,
    {rollbackReason:"review"}
  ),/Operator approval/);

  addGovernanceSelection({
    ...base,
    policy:base.state.activePolicy,
    id:"rb-late",
    outcome:null
  });

  assert.throws(()=>rollbackActivePolicy(
    base.state,
    monitor,
    base.governance,
    {
      operatorApproved:true,
      approvalReceipt:"operator:rollback",
      rollbackReason:"snapshot changed"
    }
  ),/snapshot differs/);
});

test("recommended rollback restores preserved policy and increments lineage generation",()=>{
  const base=activatedFixture({minCompletedOutcomes:1,maxContradictionRate:0});
  addGovernanceSelection({
    ...base,
    policy:base.state.activePolicy,
    id:"recommended-rb",
    outcome:"CONTRADICTED"
  });
  const monitor=monitorActivePolicy(base.state,base.governance);
  const rolled=rollbackActivePolicy(
    base.state,
    monitor,
    base.governance,
    {
      operatorApproved:true,
      approvalReceipt:"operator:rollback",
      rollbackReason:"Post-activation contradiction threshold exceeded."
    }
  );

  assert.equal(verifyPolicyRollbackReceipt(rolled.rollbackReceipt),true);
  assert.equal(rolled.rollbackReceipt.discretionaryRollback,false);
  assert.equal(rolled.state.generation,2);
  assert.equal(rolled.state.previousStateFingerprint,base.state.fingerprint);
  assert.equal(rolled.state.activePolicyFingerprint,base.state.rollbackPolicyFingerprint);
  assert.equal(rolled.state.rollbackPolicyFingerprint,base.state.activePolicyFingerprint);
  assert.equal(rolled.state.authority.experimentExecutionAuthorized,false);
});

test("operator may perform an explicit discretionary rollback",()=>{
  const base=activatedFixture({minCompletedOutcomes:3});
  addGovernanceSelection({
    ...base,
    policy:base.state.activePolicy,
    id:"disc-1",
    outcome:"SURVIVED_CHALLENGE"
  });
  const monitor=monitorActivePolicy(base.state,base.governance);
  assert.equal(monitor.status,"INSUFFICIENT_POST_ACTIVATION_EVIDENCE");

  const rolled=rollbackActivePolicy(
    base.state,
    monitor,
    base.governance,
    {
      operatorApproved:true,
      approvalReceipt:"operator:discretionary",
      rollbackReason:"Operator risk decision before threshold maturity."
    }
  );
  assert.equal(rolled.rollbackReceipt.discretionaryRollback,true);
});

test("policy state lineage remains continuous across rollback and rollback-of-rollback",()=>{
  const base=activatedFixture({minCompletedOutcomes:1});
  const monitor1=monitorActivePolicy(base.state,base.governance);
  const rolled1=rollbackActivePolicy(
    base.state,
    monitor1,
    base.governance,
    {
      operatorApproved:true,
      approvalReceipt:"operator:r1",
      rollbackReason:"First discretionary rollback."
    }
  );
  const monitor2=monitorActivePolicy(rolled1.state,base.governance);
  const rolled2=rollbackActivePolicy(
    rolled1.state,
    monitor2,
    base.governance,
    {
      operatorApproved:true,
      approvalReceipt:"operator:r2",
      rollbackReason:"Second discretionary rollback."
    }
  );

  const lineage=activePolicyStateLineage([
    rolled2.state,
    base.state,
    rolled1.state
  ]);
  assert.equal(lineage.generationCount,3);
  assert.deepEqual(lineage.states.map(x=>x.generation),[1,2,3]);
  assert.equal(lineage.states[1].previousStateFingerprint,lineage.states[0].fingerprint);
  assert.equal(lineage.states[2].previousStateFingerprint,lineage.states[1].fingerprint);
});

test("tampered promotion proposal, state, or monitor report is rejected",()=>{
  const a=proposalFixture();
  a.proposal.promotionReason="rewritten";
  assert.throws(()=>activatePolicyPromotion(
    a.proposal,
    new PortfolioGovernanceRegistry(),
    {operatorApproved:true,approvalReceipt:"operator:bad"}
  ),/fingerprint mismatch/);

  const b=activatedFixture();
  b.state.status="MYSTERY";
  assert.throws(()=>monitorActivePolicy(b.state,b.governance),/fingerprint mismatch/);

  const c=activatedFixture();
  const monitor=monitorActivePolicy(c.state,c.governance);
  monitor.status="ROLLBACK_REVIEW_RECOMMENDED";
  assert.throws(()=>rollbackActivePolicy(
    c.state,
    monitor,
    c.governance,
    {
      operatorApproved:true,
      approvalReceipt:"operator:bad-monitor",
      rollbackReason:"tampered"
    }
  ),/fingerprint mismatch/);
});
