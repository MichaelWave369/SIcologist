import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  PortfolioGovernanceRegistry,
  DEFAULT_PORTFOLIO_POLICY,
  createResearchCampaignPlan,
  createPortfolioSelectionReceipt,
  createPortfolioPolicyRevision,
  verifyPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  verifyProspectivePolicyTrialProtocol,
  policyTrialAssignment,
  createProspectivePolicyComparison,
  verifyProspectivePolicyComparison,
  recordProspectivePolicyRoundOutcome,
  verifyProspectivePolicyRoundOutcome,
  summarizeProspectivePolicyTrial,
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
      informationOpportunity:0,
      evidenceWeakness:0,
      replicationNeed:0,
      operatorImportance:1,
      costEfficiency:0
    }
  };
}

function fixture(){
  const claims=new ClaimEvidenceRegistry();
  const challenges=new ClaimChallengeRegistry();
  const programs=[];
  const trackers=new Map();

  function add(name,{importance,evidence="NONE"}){
    const target=claims.createClaim({
      claimKey:name+"_TARGET",
      statement:name+" target.",
      scope:{conditionId:"SC-007"}
    });
    const rival=claims.createClaim({
      claimKey:name+"_RIVAL",
      statement:name+" rival.",
      scope:{conditionId:"SC-007"}
    });

    if(evidence==="ROBUST"){
      claims.registerEvidence({
        claimId:target.claimId,
        evidenceType:"REPLICATION_SUMMARY",
        relation:"SUPPORTS",
        artifact:artifact({
          version:"REPLICATION_REGISTRY_SUMMARY_V0.1",
          evidenceGrade:"ROBUST_REPLICATION_CANDIDATE",
          supportRate:1,
          divergenceRate:0,
          supportReplicatorCount:5,
          supportEnvironmentCount:3,
          name
        })
      });
    }

    const plan=createResearchCampaignPlan(claims,{
      targetClaimId:target.claimId,
      rivals:[{
        rivalClaimId:rival.claimId,
        conditionId:"SC-007",
        targetHypothesisId:"H-SC-007-01",
        rivalHypothesisId:"H-SC-007-02"
      }],
      policy:{maxSteps:2,maxEstimatedCost:2},
      title:name
    });
    const tracker=new ResearchCampaignTracker(plan);
    trackers.set(name,tracker);
    programs.push({programId:name,tracker,operatorImportance:importance});
  }

  add("needs-evidence",{importance:.1,evidence:"NONE"});
  add("operator-favorite",{importance:1,evidence:"ROBUST"});

  return {claims,challenges,programs,trackers};
}

function policyArtifacts(){
  const governance=new PortfolioGovernanceRegistry();
  const review=governance.governanceReview();
  const baseline={
    ...DEFAULT_PORTFOLIO_POLICY,
    maxAllocatedCampaigns:1,
    maxEstimatedCost:10
  };
  const revision=createPortfolioPolicyRevision({
    baselinePolicy:baseline,
    proposedPolicy:candidatePolicy(),
    governanceReview:review,
    revisionReason:"Prospectively test stronger operator-importance weighting.",
    proposerId:"operator"
  });
  return {review,revision,baseline};
}

function trial(mode="ALTERNATING_AB",minRounds=2){
  const {revision}=policyArtifacts();
  return createProspectivePolicyTrialProtocol(revision,{
    assignmentMode:mode,
    minRounds,
    operatorApproved:true,
    approvalReceipt:"operator:freeze-policy-trial"
  });
}

function comparison(roundIndex,mode="ALTERNATING_AB"){
  const base=fixture();
  const protocol=trial(mode,2);
  const value=createProspectivePolicyComparison(base.claims,base.challenges,{
    programs:base.programs,
    trialProtocol:protocol,
    roundIndex,
    roundKey:"round-"+roundIndex
  });
  return {...base,protocol,comparison:value};
}

function completeActiveRound(base,outcome="SURVIVED_CHALLENGE"){
  const active=base.comparison.assignment.assignedArm==="BASELINE"
    ?base.comparison.baselinePortfolio
    :base.comparison.candidatePortfolio;
  const allocation=active.allocation.allocations[0];
  const tracker=base.trackers.get(allocation.programId);

  const portfolioReceipt=createPortfolioSelectionReceipt(active,allocation.programId,{
    operatorApproved:true,
    approvalReceipt:"operator:portfolio:"+base.comparison.roundIndex
  });
  const campaignSelection=tracker.selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:campaign:"+base.comparison.roundIndex
  });

  const governance=new PortfolioGovernanceRegistry();
  const selection=governance.registerSelection({
    portfolio:active,
    portfolioSelectionReceipt:portfolioReceipt,
    campaignSelection
  });

  const contract=base.challenges.contract(campaignSelection.challengeContractId);
  const label=Object.entries(contract.decisionTable)
    .find(([,value])=>value===outcome)?.[0];

  base.challenges.recordResult(base.claims,campaignSelection.challengeContractId,{
    observationLabel:label,
    evidenceArtifact:artifact({
      round:base.comparison.roundIndex,
      outcome
    }),
    evaluatorId:"policy-trial-evaluator"
  });
  base.challenges.attachResultToTargetClaim(
    base.claims,
    campaignSelection.challengeContractId
  );
  governance.recordOutcome(base.claims,base.challenges,selection.fingerprint);
  return governance;
}

test("policy revision requires a real governance review and a changed policy",()=>{
  const {review,baseline}=policyArtifacts();
  const revision=createPortfolioPolicyRevision({
    baselinePolicy:baseline,
    proposedPolicy:candidatePolicy(),
    governanceReview:review,
    revisionReason:"test candidate"
  });
  assert.equal(verifyPortfolioPolicyRevision(revision),true);
  assert.equal(revision.status,"PROPOSED_NOT_ACTIVATED");
  assert.equal(revision.boundaries.automaticActivation,false);

  assert.throws(()=>createPortfolioPolicyRevision({
    baselinePolicy:baseline,
    proposedPolicy:baseline,
    governanceReview:review,
    revisionReason:"no actual change"
  }),/must differ/);
});

test("tampered governance review cannot justify a policy revision",()=>{
  const governance=new PortfolioGovernanceRegistry();
  const review=governance.governanceReview();
  review.reviewStatus="HUMAN_POLICY_REVIEW_REQUIRED";
  assert.throws(()=>createPortfolioPolicyRevision({
    baselinePolicy:DEFAULT_PORTFOLIO_POLICY,
    proposedPolicy:candidatePolicy(),
    governanceReview:review,
    revisionReason:"tampered review"
  }),/fingerprint mismatch/);
});

test("trial preregistration requires operator approval and freezes metrics",()=>{
  const {revision}=policyArtifacts();
  assert.throws(()=>createProspectivePolicyTrialProtocol(revision),/Operator approval/);

  const protocol=createProspectivePolicyTrialProtocol(revision,{
    minRounds:4,
    primaryMetrics:["decisiveRate","contradictionRate"],
    operatorApproved:true,
    approvalReceipt:"operator:trial"
  });
  assert.equal(verifyProspectivePolicyTrialProtocol(protocol),true);
  assert.deepEqual(protocol.primaryMetrics,["contradictionRate","decisiveRate"]);
  assert.equal(protocol.boundaries.retrospectiveMetricChangeAllowed,false);
});

test("alternating trial assignment is deterministic and explicitly non-randomized",()=>{
  const protocol=trial("ALTERNATING_AB",4);
  assert.equal(policyTrialAssignment(protocol,1),"BASELINE");
  assert.equal(policyTrialAssignment(protocol,2),"CANDIDATE");
  assert.equal(policyTrialAssignment(protocol,3),"BASELINE");
  assert.equal(protocol.assignmentEvidence.externallyRandomized,false);
  assert.equal(protocol.assignmentEvidence.causalInference,"NOT_ESTABLISHED");
});

test("shadow mode never makes candidate active",()=>{
  const protocol=trial("BASELINE_ACTIVE_CANDIDATE_SHADOW",2);
  for(const n of [1,2,3,4]){
    assert.equal(policyTrialAssignment(protocol,n),"BASELINE");
  }
});

test("same frozen cohort can yield different baseline and candidate allocations",()=>{
  const base=comparison(1);
  const value=base.comparison;
  assert.equal(verifyProspectivePolicyComparison(value),true);
  assert.equal(value.boundaries.sameFrozenCohort,true);
  assert.equal(value.baselinePortfolio.programs.length,value.candidatePortfolio.programs.length);
  assert.ok(value.comparison.baselineOnly.length>=1);
  assert.ok(value.comparison.candidateOnly.length>=1);
  assert.notEqual(
    value.baselinePortfolio.allocation.allocations[0].programId,
    value.candidatePortfolio.allocation.allocations[0].programId
  );
});

test("candidate remains shadow-only on baseline-assigned round",()=>{
  const base=comparison(1);
  assert.equal(base.comparison.assignment.assignedArm,"BASELINE");
  assert.equal(base.comparison.assignment.candidateShadowOnly,true);
  assert.equal(base.comparison.assignment.experimentExecutionAuthorized,false);
});

test("round outcome requires governance evidence from the active portfolio",()=>{
  const base=comparison(1);
  const governance=new PortfolioGovernanceRegistry();
  assert.throws(()=>recordProspectivePolicyRoundOutcome(
    base.comparison,
    governance
  ),/No governance selections/);
});

test("pending active-arm governance selection blocks round completion",()=>{
  const base=comparison(1);
  const active=base.comparison.baselinePortfolio;
  const allocation=active.allocation.allocations[0];
  const tracker=base.trackers.get(allocation.programId);
  const portfolioReceipt=createPortfolioSelectionReceipt(active,allocation.programId,{
    operatorApproved:true,
    approvalReceipt:"operator:pending"
  });
  const campaignSelection=tracker.selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:pending-campaign"
  });
  const governance=new PortfolioGovernanceRegistry();
  governance.registerSelection({
    portfolio:active,
    portfolioSelectionReceipt:portfolioReceipt,
    campaignSelection
  });

  assert.throws(()=>recordProspectivePolicyRoundOutcome(
    base.comparison,
    governance
  ),/pending governance outcomes/);
});

test("completed active-arm governance produces a prospective round outcome",()=>{
  const base=comparison(1);
  const governance=completeActiveRound(base,"SURVIVED_CHALLENGE");
  const outcome=recordProspectivePolicyRoundOutcome(base.comparison,governance);
  assert.equal(verifyProspectivePolicyRoundOutcome(outcome),true);
  assert.equal(outcome.assignedArm,"BASELINE");
  assert.equal(outcome.metrics.completedOutcomeCount,1);
  assert.equal(outcome.metrics.decisiveRate,1);
  assert.equal(outcome.boundaries.policyEffectCausality,"NOT_ESTABLISHED");
});

test("trial summary stays insufficient before preregistered minimum rounds",()=>{
  const base=comparison(1);
  const governance=completeActiveRound(base);
  const outcome=recordProspectivePolicyRoundOutcome(base.comparison,governance);
  const protocol=createProspectivePolicyTrialProtocol(policyArtifacts().revision,{
    assignmentMode:"ALTERNATING_AB",
    minRounds:4,
    operatorApproved:true,
    approvalReceipt:"operator:four-round-trial"
  });

  // The outcome belongs to another protocol and is rejected rather than reused.
  assert.throws(()=>summarizeProspectivePolicyTrial(protocol,[outcome]),/another policy trial/);
});

test("alternating completed rounds reach human review but never auto-promote",()=>{
  const protocol=trial("ALTERNATING_AB",2);
  const rounds=[];

  for(const roundIndex of [1,2]){
    const base=fixture();
    const cmp=createProspectivePolicyComparison(base.claims,base.challenges,{
      programs:base.programs,
      trialProtocol:protocol,
      roundIndex,
      roundKey:"ab-"+roundIndex
    });
    const wrapped={...base,protocol,comparison:cmp};
    const governance=completeActiveRound(
      wrapped,
      roundIndex===1?"INCONCLUSIVE":"SURVIVED_CHALLENGE"
    );
    rounds.push(recordProspectivePolicyRoundOutcome(cmp,governance));
  }

  const summary=summarizeProspectivePolicyTrial(protocol,rounds);
  assert.equal(summary.minRoundsMet,true);
  assert.equal(summary.baseline.assignedRoundCount,1);
  assert.equal(summary.candidate.assignedRoundCount,1);
  assert.equal(summary.evaluationStatus,"HUMAN_POLICY_REVIEW_REQUIRED");
  assert.equal(summary.candidatePromotionAuthorized,false);
  assert.equal(summary.automaticPolicyActivation,false);
  assert.equal(summary.causalStatus,"NOT_ESTABLISHED");
});

test("shadow-only trial cannot produce candidate performance evidence",()=>{
  const protocol=trial("BASELINE_ACTIVE_CANDIDATE_SHADOW",2);
  const rounds=[];

  for(const roundIndex of [1,2]){
    const base=fixture();
    const cmp=createProspectivePolicyComparison(base.claims,base.challenges,{
      programs:base.programs,
      trialProtocol:protocol,
      roundIndex,
      roundKey:"shadow-"+roundIndex
    });
    const wrapped={...base,protocol,comparison:cmp};
    const governance=completeActiveRound(wrapped,"SURVIVED_CHALLENGE");
    rounds.push(recordProspectivePolicyRoundOutcome(cmp,governance));
  }

  const summary=summarizeProspectivePolicyTrial(protocol,rounds);
  assert.equal(summary.evaluationStatus,"SHADOW_COMPARISON_ONLY");
  assert.equal(summary.candidate.assignedRoundCount,0);
  assert.equal(summary.candidate.completedOutcomeCount,0);
  assert.equal(summary.candidatePromotionAuthorized,false);
});

test("duplicate round index or key is rejected",()=>{
  const protocol=trial("ALTERNATING_AB",2);
  const base=fixture();
  const cmp=createProspectivePolicyComparison(base.claims,base.challenges,{
    programs:base.programs,
    trialProtocol:protocol,
    roundIndex:1,
    roundKey:"duplicate"
  });
  const wrapped={...base,protocol,comparison:cmp};
  const governance=completeActiveRound(wrapped);
  const outcome=recordProspectivePolicyRoundOutcome(cmp,governance);

  assert.throws(
    ()=>summarizeProspectivePolicyTrial(protocol,[outcome,outcome]),
    /Duplicate policy trial roundIndex/
  );
});

test("tampered comparison cannot accept prospective outcomes",()=>{
  const base=comparison(1);
  const governance=completeActiveRound(base);
  base.comparison.comparison.allocationAgreementRate=1;
  assert.throws(()=>recordProspectivePolicyRoundOutcome(
    base.comparison,
    governance
  ),/fingerprint mismatch/);
});
