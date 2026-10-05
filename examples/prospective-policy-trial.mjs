import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  PortfolioGovernanceRegistry,
  DEFAULT_PORTFOLIO_POLICY,
  createResearchCampaignPlan,
  createPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  createProspectivePolicyComparison
} from "../src/index.js";

const claims=new ClaimEvidenceRegistry();
const challenges=new ClaimChallengeRegistry();

function program(name,importance){
  const target=claims.createClaim({
    claimKey:name+"_TARGET",
    statement:name+" target claim.",
    scope:{conditionId:"SC-007"}
  });
  const rival=claims.createClaim({
    claimKey:name+"_RIVAL",
    statement:name+" rival claim.",
    scope:{conditionId:"SC-007"}
  });
  const plan=createResearchCampaignPlan(claims,{
    targetClaimId:target.claimId,
    rivals:[{
      rivalClaimId:rival.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-02"
    }]
  });
  return {
    programId:name,
    tracker:new ResearchCampaignTracker(plan),
    operatorImportance:importance
  };
}

const governance=new PortfolioGovernanceRegistry();
const review=governance.governanceReview();

const revision=createPortfolioPolicyRevision({
  baselinePolicy:DEFAULT_PORTFOLIO_POLICY,
  proposedPolicy:{
    ...DEFAULT_PORTFOLIO_POLICY,
    weights:{
      informationOpportunity:.20,
      evidenceWeakness:.20,
      replicationNeed:.15,
      operatorImportance:.35,
      costEfficiency:.10
    }
  },
  governanceReview:review,
  revisionReason:"Prospectively test greater operator-priority weight."
});

const trial=createProspectivePolicyTrialProtocol(revision,{
  assignmentMode:"BASELINE_ACTIVE_CANDIDATE_SHADOW",
  minRounds:4,
  operatorApproved:true,
  approvalReceipt:"operator:freeze-example-trial"
});

const comparison=createProspectivePolicyComparison(claims,challenges,{
  programs:[
    program("program-a",.9),
    program("program-b",.4)
  ],
  trialProtocol:trial,
  roundIndex:1,
  roundKey:"example-round-1",
  title:"Portfolio policy trial"
});

console.log(JSON.stringify({
  revision,
  trial,
  roundComparison:comparison
},null,2));
