import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

const claims=new ClaimEvidenceRegistry();

const target=claims.createClaim({
  claimKey:"SC007.TOOL_INSTABILITY",
  statement:"Recoverable tool instability best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});

const rival=claims.createClaim({
  claimKey:"SC007.PLAN_ERROR",
  statement:"A malformed local action plan best explains the retry spiral.",
  scope:{conditionId:"SC-007"}
});

const challenges=new ClaimChallengeRegistry();

const contract=challenges.preregister(claims,{
  targetClaimId:target.claimId,
  rivalClaimId:rival.claimId,
  challengeQuestion:"Does replacing the dependency with a known-good fixture remove the retry spiral?",
  expectedObservation:"The retry spiral disappears when the dependency is replaced.",
  falsifier:"The retry spiral persists under the known-good fixture.",
  boundaryConditions:["same task","same role","read-only comparison"],
  probeId:"known_good_fixture",
  decisionTable:{
    FIXTURE_RECOVERS:"SURVIVED_CHALLENGE",
    FIXTURE_STILL_FAILS:"CONTRADICTED",
    PARTIAL_RECOVERY:"WEAKENED",
    NOT_EVALUABLE:"INCONCLUSIVE"
  }
});

const result=challenges.recordResult(claims,contract.contractId,{
  observationLabel:"FIXTURE_STILL_FAILS",
  evidenceArtifact:artifact({
    probeId:"known_good_fixture",
    observed:"retry spiral persisted"
  }),
  evaluatorId:"example-evaluator"
});

challenges.attachResultToTargetClaim(claims,contract.contractId);

console.log(JSON.stringify({
  contract,
  result,
  targetAssessment:claims.assessClaim(target.claimId),
  rivalAssessment:claims.assessClaim(rival.claimId)
},null,2));
