import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  DEFAULT_STRESS_WEIGHTS,
  generateClaimStressReport,
  preregisterStressCandidate,
  fingerprint
} from "../src/index.js";

function claims(){
  const registry=new ClaimEvidenceRegistry();
  const target=registry.createClaim({
    claimKey:"TARGET",
    statement:"External tool failure best explains the retry spiral.",
    scope:{conditionId:"SC-007"}
  });
  const rival=registry.createClaim({
    claimKey:"RIVAL",
    statement:"Retry policy failure best explains the retry spiral.",
    scope:{conditionId:"SC-007"}
  });
  return {registry,target,rival};
}

function report(options={}){
  const {registry,target,rival}=claims();
  const stress=generateClaimStressReport(registry,{
    targetClaimId:target.claimId,
    rivalClaimId:rival.claimId,
    conditionId:"SC-007",
    targetHypothesisId:"H-SC-007-01",
    rivalHypothesisId:"H-SC-007-02",
    boundaryConditions:["same task","same role"],
    ...options
  });
  return {registry,target,rival,stress};
}

test("stress report binds claims to explicit hypotheses",()=>{
  const {stress,target,rival}=report();
  assert.equal(stress.target.claimId,target.claimId);
  assert.equal(stress.rival.claimId,rival.claimId);
  assert.equal(stress.target.hypothesisId,"H-SC-007-01");
  assert.equal(stress.rival.hypothesisId,"H-SC-007-02");
  assert.equal(stress.boundaries.operatorSelectionRequired,true);
  assert.equal(stress.boundaries.generatorExecutesProbes,false);
});

test("stress candidates expose transparent ranking components",()=>{
  const {stress}=report();
  assert.ok(stress.candidates.length>=1);
  for(const candidate of stress.candidates){
    assert.ok(candidate.metrics.informationGain>=0);
    assert.ok(candidate.metrics.discrimination>0);
    assert.ok(candidate.metrics.estimatedCost>=0&&candidate.metrics.estimatedCost<=1);
    assert.ok(candidate.metrics.estimatedInvasiveness>=0&&candidate.metrics.estimatedInvasiveness<=1);
    assert.equal(candidate.recommendationOnly,true);
    assert.equal(candidate.executionAuthorized,false);
    assert.equal(candidate.preregistered,false);
  }
  assert.deepEqual(stress.scoring.weights,DEFAULT_STRESS_WEIGHTS);
  assert.equal(stress.scoring.costMeasured,false);
});

test("known-good fixture direction reflects the selected hypothesis pair",()=>{
  const {stress}=report();
  const fixture=stress.candidates.find(item=>item.probeId==="known_good_fixture");
  assert.equal(fixture.predictions.positiveFavors,"TARGET");
  assert.equal(fixture.generatedContract.decisionTable.PROBE_POSITIVE,"SURVIVED_CHALLENGE");
  assert.equal(fixture.generatedContract.decisionTable.PROBE_NEGATIVE,"CONTRADICTED");

  const retry=stress.candidates.find(item=>item.probeId==="single_retry_with_backoff");
  assert.equal(retry.predictions.positiveFavors,"RIVAL");
  assert.equal(retry.generatedContract.decisionTable.PROBE_POSITIVE,"CONTRADICTED");
  assert.equal(retry.generatedContract.decisionTable.PROBE_NEGATIVE,"SURVIVED_CHALLENGE");
});

test("ranking is deterministic",()=>{
  const a=report().stress;
  const b=report().stress;
  assert.deepEqual(
    a.candidates.map(x=>[x.probeId,x.metrics.stressScore,x.candidateId]),
    b.candidates.map(x=>[x.probeId,x.metrics.stressScore,x.candidateId])
  );
  assert.equal(a.fingerprint,b.fingerprint);
});

test("cost override is explicit and preserved",()=>{
  const {stress}=report({
    costOverrides:{known_good_fixture:.99}
  });
  const fixture=stress.candidates.find(item=>item.probeId==="known_good_fixture");
  assert.equal(fixture.metrics.estimatedCost,.99);
  assert.equal(stress.scoring.costSource,"ENGINEERING_DEFAULTS_WITH_OVERRIDES");
  assert.equal(stress.scoring.costMeasured,false);
});

test("invalid scoring weights are rejected",()=>{
  assert.throws(()=>report({
    weights:{
      informationGain:.5,
      discrimination:.5,
      costEfficiency:.5,
      lowInvasiveness:0
    }
  }),/sum to 1/);
});

test("claim scope and hypothesis bindings are validated",()=>{
  const {registry,target,rival}=claims();
  assert.throws(()=>generateClaimStressReport(registry,{
    targetClaimId:target.claimId,
    rivalClaimId:rival.claimId,
    conditionId:"SC-006",
    targetHypothesisId:"H-SC-006-01",
    rivalHypothesisId:"H-SC-006-02"
  }),/scope condition/);

  assert.throws(()=>generateClaimStressReport(registry,{
    targetClaimId:target.claimId,
    rivalClaimId:rival.claimId,
    conditionId:"SC-007",
    targetHypothesisId:"H-SC-007-99",
    rivalHypothesisId:"H-SC-007-02"
  }),/Unknown target hypothesisId/);
});

test("generation does not preregister anything automatically",()=>{
  const {stress}=report();
  const challenges=new ClaimChallengeRegistry();
  assert.equal(challenges.export().contracts.length,0);
  assert.equal(stress.boundaries.generatorPreregistersAutomatically,false);
});

test("operator can select an exact candidate into a Rung 15 contract",()=>{
  const {registry,stress}=report();
  const challenges=new ClaimChallengeRegistry();
  const chosen=stress.recommendation;

  const receipt=preregisterStressCandidate({
    claimRegistry:registry,
    challengeRegistry:challenges,
    stressReport:stress,
    candidateId:chosen.candidateId,
    operatorApproved:true,
    approvalReceipt:"operator:stress-selection"
  });

  assert.equal(receipt.candidateId,chosen.candidateId);
  assert.equal(receipt.executionAuthorized,false);
  assert.equal(challenges.export().contracts.length,1);
  const contract=challenges.contract(receipt.challengeContractId);
  assert.equal(contract.discriminatingProbe.probeId,chosen.probeId);
  assert.equal(contract.state,"PREREGISTERED");
});

test("stress selection requires explicit operator approval and receipt",()=>{
  const {registry,stress}=report();
  const challenges=new ClaimChallengeRegistry();

  assert.throws(()=>preregisterStressCandidate({
    claimRegistry:registry,
    challengeRegistry:challenges,
    stressReport:stress,
    candidateId:stress.recommendation.candidateId
  }),/Operator approval/);

  assert.throws(()=>preregisterStressCandidate({
    claimRegistry:registry,
    challengeRegistry:challenges,
    stressReport:stress,
    candidateId:stress.recommendation.candidateId,
    operatorApproved:true,
    approvalReceipt:""
  }),/approval receipt/);
});

test("tampered stress report cannot be selected",()=>{
  const {registry,stress}=report();
  const challenges=new ClaimChallengeRegistry();
  stress.candidates[0].metrics.stressScore=1;

  assert.throws(()=>preregisterStressCandidate({
    claimRegistry:registry,
    challengeRegistry:challenges,
    stressReport:stress,
    candidateId:stress.candidates[0].candidateId,
    operatorApproved:true,
    approvalReceipt:"operator:test"
  }),/fingerprint mismatch/);
});

test("superseding a claim invalidates an old stress report",()=>{
  const {registry,target,stress}=report();
  const challenges=new ClaimChallengeRegistry();
  registry.reviseClaim(target.claimId,{
    statement:"A narrower revised target claim.",
    reason:"scope refinement"
  });

  assert.throws(()=>preregisterStressCandidate({
    claimRegistry:registry,
    challengeRegistry:challenges,
    stressReport:stress,
    candidateId:stress.recommendation.candidateId,
    operatorApproved:true,
    approvalReceipt:"operator:test"
  }),/superseded/);
});

test("selection receipt is deterministic for identical frozen inputs",()=>{
  function run(){
    const {registry,stress}=report();
    const challenges=new ClaimChallengeRegistry();
    return preregisterStressCandidate({
      claimRegistry:registry,
      challengeRegistry:challenges,
      stressReport:stress,
      candidateId:stress.recommendation.candidateId,
      operatorApproved:true,
      approvalReceipt:"operator:deterministic"
    });
  }
  assert.deepEqual(run(),run());
});
