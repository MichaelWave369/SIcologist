import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  createResearchCampaignPlan,
  createAdaptiveCampaignRevision,
  activateAdaptiveCampaignRevision,
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
const rival=claims.createClaim({
  claimKey:"SC007.RETRY_POLICY",
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
  }],
  policy:{maxSteps:2,maxEstimatedCost:1},
  title:"Adaptive example"
});

const challenges=new ClaimChallengeRegistry();
const tracker=new ResearchCampaignTracker(plan);

const selection=tracker.selectNext({
  claimRegistry:claims,
  challengeRegistry:challenges,
  operatorApproved:true,
  approvalReceipt:"operator:step1"
});
const contract=challenges.contract(selection.challengeContractId);
const positiveLabel=Object.entries(contract.decisionTable)
  .find(([,outcome])=>outcome==="SURVIVED_CHALLENGE")[0];

challenges.recordResult(claims,selection.challengeContractId,{
  observationLabel:positiveLabel,
  evidenceArtifact:artifact({result:"target survived first challenge"}),
  evaluatorId:"example-evaluator"
});
challenges.attachResultToTargetClaim(claims,selection.challengeContractId);

const revision=createAdaptiveCampaignRevision(claims,challenges,{
  priorTracker:tracker,
  revisionReason:"Checkpoint 1 completed; retire the tested probe and recalculate."
});

const activated=activateAdaptiveCampaignRevision(revision,{
  operatorApproved:true,
  approvalReceipt:"operator:activate-v2"
});

console.log(JSON.stringify({
  oldPlanFingerprint:plan.fingerprint,
  revision,
  activationReceipt:activated.activationReceipt,
  newCampaignGate:activated.tracker.gate(claims,challenges)
},null,2));
