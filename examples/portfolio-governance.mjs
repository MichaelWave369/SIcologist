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

const claims=new ClaimEvidenceRegistry();
const challenges=new ClaimChallengeRegistry();

const target=claims.createClaim({
  claimKey:"GOV_TARGET",
  statement:"External tool failure best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});
const rival=claims.createClaim({
  claimKey:"GOV_RIVAL",
  statement:"Retry policy failure best explains the retry spiral.",
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
const tracker=new ResearchCampaignTracker(plan);

const portfolio=createResearchPortfolio(claims,challenges,{
  programs:[{
    programId:"retry-program",
    tracker,
    operatorImportance:.8
  }]
});

const portfolioSelection=createPortfolioSelectionReceipt(
  portfolio,
  "retry-program",
  {
    operatorApproved:true,
    approvalReceipt:"operator:portfolio-selection"
  }
);

const campaignSelection=tracker.selectNext({
  claimRegistry:claims,
  challengeRegistry:challenges,
  operatorApproved:true,
  approvalReceipt:"operator:campaign-selection"
});

const governance=new PortfolioGovernanceRegistry();

const selection=governance.registerSelection({
  portfolio,
  portfolioSelectionReceipt:portfolioSelection,
  campaignSelection
});

const contract=challenges.contract(campaignSelection.challengeContractId);
const label=Object.entries(contract.decisionTable)
  .find(([,outcome])=>outcome==="SURVIVED_CHALLENGE")[0];

challenges.recordResult(claims,campaignSelection.challengeContractId,{
  observationLabel:label,
  evidenceArtifact:artifact({result:"target survived"}),
  evaluatorId:"example-evaluator"
});

challenges.attachResultToTargetClaim(
  claims,
  campaignSelection.challengeContractId
);

const outcome=governance.recordOutcome(
  claims,
  challenges,
  selection.fingerprint
);

console.log(JSON.stringify({
  selection,
  outcome,
  summary:governance.summary(),
  review:governance.governanceReview()
},null,2));
