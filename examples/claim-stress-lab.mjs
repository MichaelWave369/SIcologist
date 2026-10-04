import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  generateClaimStressReport,
  preregisterStressCandidate
} from "../src/index.js";

const claims=new ClaimEvidenceRegistry();

const target=claims.createClaim({
  claimKey:"SC007.EXTERNAL_TOOL",
  statement:"External tool failure best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});

const rival=claims.createClaim({
  claimKey:"SC007.RETRY_POLICY",
  statement:"Retry policy failure best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});

const stress=generateClaimStressReport(claims,{
  targetClaimId:target.claimId,
  rivalClaimId:rival.claimId,
  conditionId:"SC-007",
  targetHypothesisId:"H-SC-007-01",
  rivalHypothesisId:"H-SC-007-02",
  boundaryConditions:["same task","same role","read-only or shadow probe"]
});

const challenges=new ClaimChallengeRegistry();

const selection=preregisterStressCandidate({
  claimRegistry:claims,
  challengeRegistry:challenges,
  stressReport:stress,
  candidateId:stress.recommendation.candidateId,
  operatorApproved:true,
  approvalReceipt:"operator:example-selection"
});

console.log(JSON.stringify({
  recommendation:stress.recommendation,
  selection,
  challenge:challenges.contract(selection.challengeContractId)
},null,2));
