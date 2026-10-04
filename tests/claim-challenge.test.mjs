import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

function claims(){
  const registry=new ClaimEvidenceRegistry();
  const target=registry.createClaim({
    claimKey:"TARGET",
    statement:"Recoverable tool instability best explains the retry behavior.",
    scope:{conditionId:"SC-007"}
  });
  const rival=registry.createClaim({
    claimKey:"RIVAL",
    statement:"The retry behavior is primarily caused by a malformed local action plan.",
    scope:{conditionId:"SC-007"}
  });
  return {registry,target,rival};
}

const DECISION_TABLE={
  FIXTURE_RECOVERS:"SURVIVED_CHALLENGE",
  FIXTURE_STILL_FAILS:"CONTRADICTED",
  PARTIAL_RECOVERY:"WEAKENED",
  NOT_EVALUABLE:"INCONCLUSIVE"
};

function preregister(challenges,claimRegistry,target,rival){
  return challenges.preregister(claimRegistry,{
    targetClaimId:target.claimId,
    rivalClaimId:rival.claimId,
    challengeQuestion:"Does a known-good fixture remove the retry spiral?",
    expectedObservation:"If the target claim is useful, the retry spiral should disappear under the fixture.",
    falsifier:"The retry spiral persists under the known-good fixture.",
    boundaryConditions:["same task","same role contract","no persistent memory mutation"],
    probeId:"known_good_fixture",
    decisionTable:DECISION_TABLE,
    preregistrationNote:"Interpret only inside the frozen task scope."
  });
}

test("challenge preregistration binds current distinct claim revisions",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  assert.equal(contract.target.claimId,target.claimId);
  assert.equal(contract.rival.claimId,rival.claimId);
  assert.equal(contract.state,"PREREGISTERED");
  assert.equal(contract.discriminatingProbe.probeId,"known_good_fixture");
  assert.equal(contract.boundaries.targetProvenBySurvival,false);

  assert.throws(()=>challenges.preregister(registry,{
    targetClaimId:target.claimId,
    rivalClaimId:target.claimId,
    challengeQuestion:"same claim",
    expectedObservation:"x",
    falsifier:"y",
    probeId:"known_good_fixture",
    decisionTable:DECISION_TABLE
  }),/must differ/);
});

test("challenge requires a real probe and a real falsifier path",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();

  assert.throws(()=>challenges.preregister(registry,{
    targetClaimId:target.claimId,
    rivalClaimId:rival.claimId,
    challengeQuestion:"bad probe",
    expectedObservation:"x",
    falsifier:"y",
    probeId:"imaginary_probe",
    decisionTable:DECISION_TABLE
  }),/Unknown discriminating probe/);

  assert.throws(()=>challenges.preregister(registry,{
    targetClaimId:target.claimId,
    rivalClaimId:rival.claimId,
    challengeQuestion:"sham falsifier",
    expectedObservation:"x",
    falsifier:"y",
    probeId:"known_good_fixture",
    decisionTable:{
      A:"SURVIVED_CHALLENGE",
      B:"WEAKENED"
    }
  }),/CONTRADICTED/);
});

test("same preregistration inputs are deterministic and duplicate contracts are rejected",()=>{
  const {registry,target,rival}=claims();
  const a=new ClaimChallengeRegistry();
  const b=new ClaimChallengeRegistry();
  const first=preregister(a,registry,target,rival);
  const second=preregister(b,registry,target,rival);
  assert.equal(first.contractId,second.contractId);
  assert.throws(()=>preregister(a,registry,target,rival),/DUPLICATE_CHALLENGE_CONTRACT/);
});

test("observed label selects the frozen outcome",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  const result=challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_STILL_FAILS",
    evidenceArtifact:artifact({probe:"known_good_fixture",result:"retry persisted"}),
    evaluatorId:"reviewer-a"
  });
  assert.equal(result.outcome,"CONTRADICTED");
  assert.equal(result.interpretation.targetClaimProven,false);
  assert.equal(result.interpretation.rivalClaimProven,false);
  assert.equal(challenges.summary(contract.contractId).state,"RESOLVED");
});

test("unregistered observation labels are rejected",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  assert.throws(()=>challenges.recordResult(registry,contract.contractId,{
    observationLabel:"SURPRISE_RESULT",
    evidenceArtifact:artifact({result:"surprise"}),
    evaluatorId:"reviewer-a"
  }),/not preregistered/);
});

test("tampered challenge evidence is rejected",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  const evidence=artifact({result:"persisted"});
  evidence.result="recovered";
  assert.throws(()=>challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_STILL_FAILS",
    evidenceArtifact:evidence,
    evaluatorId:"reviewer-a"
  }),/fingerprint mismatch/);
});

test("a challenge contract resolves only once",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_RECOVERS",
    evidenceArtifact:artifact({result:"recovered"}),
    evaluatorId:"reviewer-a"
  });
  assert.throws(()=>challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_STILL_FAILS",
    evidenceArtifact:artifact({result:"failed"}),
    evaluatorId:"reviewer-b"
  }),/CHALLENGE_ALREADY_RESOLVED/);
});

test("superseding either claim invalidates execution of the old challenge",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  registry.reviseClaim(target.claimId,{
    statement:"A narrower target claim.",
    reason:"scope correction"
  });
  assert.throws(()=>challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_RECOVERS",
    evidenceArtifact:artifact({result:"recovered"}),
    evaluatorId:"reviewer-a"
  }),/superseded/);
});

test("contradicted challenge attaches as contradiction to target only",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_STILL_FAILS",
    evidenceArtifact:artifact({result:"retry persisted"}),
    evaluatorId:"reviewer-a"
  });
  const evidence=challenges.attachResultToTargetClaim(registry,contract.contractId);
  assert.equal(evidence.relation,"CONTRADICTS");
  assert.equal(evidence.evidenceType,"CLAIM_CHALLENGE_RESULT");
  assert.equal(registry.assessClaim(target.claimId).status,"CONTRADICTED");
  assert.equal(registry.assessClaim(rival.claimId).status,"UNASSESSED");
});

test("survival attaches as support but does not become proof",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  const result=challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_RECOVERS",
    evidenceArtifact:artifact({result:"recovered"}),
    evaluatorId:"reviewer-a"
  });
  challenges.attachResultToTargetClaim(registry,contract.contractId);
  const assessment=registry.assessClaim(target.claimId);
  assert.equal(result.outcome,"SURVIVED_CHALLENGE");
  assert.equal(assessment.status,"SUPPORT_ONLY");
  assert.equal(assessment.boundary.scientificTruth,"NOT_ESTABLISHED");
});

test("weakened and inconclusive outcomes map to qualifying and context evidence",()=>{
  for(const [label,relation] of [
    ["PARTIAL_RECOVERY","QUALIFIES"],
    ["NOT_EVALUABLE","CONTEXT"]
  ]){
    const {registry,target,rival}=claims();
    const challenges=new ClaimChallengeRegistry();
    const contract=preregister(challenges,registry,target,rival);
    challenges.recordResult(registry,contract.contractId,{
      observationLabel:label,
      evidenceArtifact:artifact({label}),
      evaluatorId:"reviewer-a"
    });
    const attached=challenges.attachResultToTargetClaim(registry,contract.contractId);
    assert.equal(attached.relation,relation);
  }
});

test("challenge registry export and restore preserve contracts and results",()=>{
  const {registry,target,rival}=claims();
  const challenges=new ClaimChallengeRegistry();
  const contract=preregister(challenges,registry,target,rival);
  challenges.recordResult(registry,contract.contractId,{
    observationLabel:"FIXTURE_RECOVERS",
    evidenceArtifact:artifact({result:"recovered"}),
    evaluatorId:"reviewer-a"
  });
  const snapshot=challenges.export();
  const restored=ClaimChallengeRegistry.fromSnapshot(snapshot);
  assert.deepEqual(restored.export(),snapshot);
  assert.deepEqual(restored.summary(contract.contractId),challenges.summary(contract.contractId));
});
