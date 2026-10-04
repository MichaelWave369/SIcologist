import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  createResearchCampaignPlan,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

const claims=new ClaimEvidenceRegistry();

const target=claims.createClaim({
  claimKey:"SC007.TARGET",
  statement:"External tool failure best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});

const retryPolicy=claims.createClaim({
  claimKey:"SC007.RETRY_POLICY",
  statement:"Retry policy failure best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});

const adapter=claims.createClaim({
  claimKey:"SC007.RUNTIME_ADAPTER",
  statement:"Runtime adapter failure best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});

const plan=createResearchCampaignPlan(claims,{
  targetClaimId:target.claimId,
  rivals:[
    {
      rivalClaimId:retryPolicy.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-02",
      boundaryConditions:["same task","same role"]
    },
    {
      rivalClaimId:adapter.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-03",
      boundaryConditions:["same task","same role"]
    }
  ],
  policy:{
    maxSteps:3,
    maxEstimatedCost:1
  },
  title:"SC-007 targeted falsification campaign"
});

const challenges=new ClaimChallengeRegistry();
const tracker=new ResearchCampaignTracker(plan);

const gate=tracker.gate(claims,challenges);

let selection=null;
if(gate.decision==="READY_FOR_OPERATOR_SELECTION"){
  selection=tracker.selectNext({
    claimRegistry:claims,
    challengeRegistry:challenges,
    operatorApproved:true,
    approvalReceipt:"operator:campaign-example"
  });
}

console.log(JSON.stringify({
  plan,
  initialGate:gate,
  selection,
  afterSelection:tracker.gate(claims,challenges)
},null,2));
