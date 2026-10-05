import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  createResearchCampaignPlan,
  createResearchPortfolio,
  createPortfolioSelectionReceipt
} from "../src/index.js";

const claims=new ClaimEvidenceRegistry();
const challenges=new ClaimChallengeRegistry();

function campaign(name,targetHypothesisId,rivalHypothesisId){
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
      targetHypothesisId,
      rivalHypothesisId
    }],
    policy:{maxSteps:2,maxEstimatedCost:1},
    title:name
  });
  return new ResearchCampaignTracker(plan);
}

const portfolio=createResearchPortfolio(claims,challenges,{
  title:"SC-007 research portfolio",
  programs:[
    {
      programId:"tool-vs-retry",
      tracker:campaign("tool-vs-retry","H-SC-007-01","H-SC-007-02"),
      operatorImportance:.9
    },
    {
      programId:"tool-vs-adapter",
      tracker:campaign("tool-vs-adapter","H-SC-007-01","H-SC-007-03"),
      operatorImportance:.6
    }
  ],
  policy:{
    maxAllocatedCampaigns:1,
    maxEstimatedCost:1
  }
});

const chosen=portfolio.allocation.allocations[0];
const receipt=createPortfolioSelectionReceipt(portfolio,chosen.programId,{
  operatorApproved:true,
  approvalReceipt:"operator:portfolio-example"
});

console.log(JSON.stringify({portfolio,receipt},null,2));
