import test from "node:test";
import assert from "node:assert/strict";
import {
  CaseFile,
  RealCaseDatasetRegistry,
  createIndependentCustodySplit,
  createIndependentSubmission,
  scoreIndependentSubmission,
  predictIndependentChallenge,
  createReplicationProtocol,
  createReplicationReceipt,
  verifyReplicationProtocol,
  verifyReplicationReceipt,
  fingerprint
} from "../src/index.js";

const SOURCE_COMMIT="1".repeat(40);
const DEPENDENCY_FINGERPRINT="2".repeat(64);

const ENVIRONMENT={
  os:"linux",
  arch:"x64",
  runtimeFamily:"node",
  runtimeVersion:"24.0.0",
  hardwareClass:"ci-standard"
};

function addCase(registry,{id,label,outcomes}){
  const file=new CaseFile({caseId:id,agentId:"agent-"+id});
  file.close("replication fixture");
  const candidate=registry.ingest({
    caseSnapshot:file.snapshot(),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"lineage-"+id,
    sourceRefs:["source:"+id],
    probeOutcomes:outcomes
  });
  for(const reviewer of ["a","b"]){
    candidate.submitAdjudication({
      reviewerId:reviewer+"-"+id,
      hypothesisId:label,
      confidence:.9,
      evidenceRefs:["evidence:"+reviewer+":"+id]
    });
  }
  candidate.sealAdjudication();
  candidate.approve({operatorApproved:true,approvalReceipt:"operator:"+id});
}

function fixture({tolerances={},environmentPolicy={}}={}){
  const registry=new RealCaseDatasetRegistry();
  addCase(registry,{
    id:"rep-1",
    label:"H-SC-007-02",
    outcomes:{known_good_fixture:"NEGATIVE",single_retry_with_backoff:"POSITIVE"}
  });
  addCase(registry,{
    id:"rep-2",
    label:"H-SC-007-01",
    outcomes:{known_good_fixture:"POSITIVE",single_retry_with_backoff:"NEGATIVE"}
  });

  const {challengeBundle,custodyBundle}=createIndependentCustodySplit(
    registry.exportEvaluationQuarantine(),
    {evaluatorId:"reference-evaluator"}
  );
  const predictions=predictIndependentChallenge(challengeBundle);
  const submissionBundle=createIndependentSubmission(challengeBundle,{
    modelId:"heuristic",
    modelVersion:"0.1",
    artifactFingerprint:fingerprint({model:"ENGINEERING_HEURISTIC_V0.1"}),
    predictions,
    runnerAttestation:"reference"
  });
  const referenceReceipt=scoreIndependentSubmission({
    challengeBundle,
    custodyBundle,
    submissionBundle,
    evaluatorReceipt:"reference:score"
  });
  const protocol=createReplicationProtocol({
    referenceReceipt,
    challengeBundle,
    sourceCommit:SOURCE_COMMIT,
    dependencyFingerprint:DEPENDENCY_FINGERPRINT,
    referenceEnvironment:ENVIRONMENT,
    seedSchedule:[3,6,9],
    tolerances,
    environmentPolicy
  });
  return {challengeBundle,custodyBundle,predictions,referenceReceipt,protocol};
}

function replicate(base,{
  predictions=base.predictions,
  environment=ENVIRONMENT,
  sourceCommit=SOURCE_COMMIT,
  dependencyFingerprint=DEPENDENCY_FINGERPRINT,
  seedSchedule=[3,6,9]
}={}){
  const submissionBundle=createIndependentSubmission(base.challengeBundle,{
    modelId:"heuristic",
    modelVersion:"0.1",
    artifactFingerprint:fingerprint({model:"ENGINEERING_HEURISTIC_V0.1"}),
    predictions,
    runnerAttestation:"replication"
  });
  const evaluationReceipt=scoreIndependentSubmission({
    challengeBundle:base.challengeBundle,
    custodyBundle:base.custodyBundle,
    submissionBundle,
    evaluatorReceipt:"replication:score"
  });
  return createReplicationReceipt(base.protocol,{
    replicatorId:"replication-lab-A",
    challengeBundle:base.challengeBundle,
    submissionBundle,
    evaluationReceipt,
    environment,
    sourceCommit,
    dependencyFingerprint,
    seedSchedule
  });
}

test("replication protocol is frozen and fingerprinted",()=>{
  const {protocol}=fixture();
  assert.equal(protocol.status,"FROZEN");
  assert.equal(protocol.artifacts.sourceCommit,SOURCE_COMMIT);
  assert.deepEqual(protocol.seedSchedule,[3,6,9]);
  assert.equal(verifyReplicationProtocol(protocol),true);
  const tampered=structuredClone(protocol);
  tampered.seedSchedule=[1];
  assert.equal(verifyReplicationProtocol(tampered),false);
});

test("same artifacts and predictions produce REPLAY_EXACT",()=>{
  const receipt=replicate(fixture());
  assert.equal(receipt.replicationStatus,"REPLAY_EXACT");
  assert.equal(receipt.predictions.commitmentExact,true);
  assert.equal(receipt.predictions.agreement,1);
  assert.equal(receipt.metrics.absoluteDeltas.accuracy,0);
  assert.equal(verifyReplicationReceipt(receipt),true);
});

test("non-required environment drift can still replay exactly",()=>{
  const base=fixture();
  const receipt=replicate(base,{
    environment:{...ENVIRONMENT,os:"windows",arch:"arm64",hardwareClass:"other-lab"}
  });
  assert.equal(receipt.replicationStatus,"REPLAY_EXACT");
  assert.ok(receipt.environment.drift.length>=2);
  assert.equal(receipt.environment.requiredMismatch.length,0);
});

test("required environment drift produces ENVIRONMENT_MISMATCH",()=>{
  const base=fixture({environmentPolicy:{requiredExact:["runtimeFamily"]}});
  const receipt=replicate(base,{environment:{...ENVIRONMENT,runtimeFamily:"bun"}});
  assert.equal(receipt.replicationStatus,"ENVIRONMENT_MISMATCH");
  assert.equal(receipt.environment.requiredMismatch[0].field,"runtimeFamily");
});

test("source drift produces ARTIFACT_MISMATCH",()=>{
  const receipt=replicate(fixture(),{sourceCommit:"3".repeat(40)});
  assert.equal(receipt.replicationStatus,"ARTIFACT_MISMATCH");
  assert.ok(receipt.artifactMismatches.includes("sourceCommit"));
});

test("same top predictions with small probability drift can be within tolerance",()=>{
  const base=fixture({
    tolerances:{
      accuracy:0,
      multiclassBrier:.1,
      logLoss:.2,
      expectedCalibrationError:.2,
      minPredictionAgreement:1
    }
  });
  const modified=structuredClone(base.predictions);
  for(const prediction of modified){
    prediction.ranking.sort((a,b)=>b.posteriorWeight-a.posteriorWeight);
    const room=Math.min(.005,prediction.ranking[1].posteriorWeight);
    prediction.ranking[0].posteriorWeight+=room;
    prediction.ranking[1].posteriorWeight-=room;
  }
  const receipt=replicate(base,{predictions:modified});
  assert.equal(receipt.predictions.agreement,1);
  assert.equal(receipt.predictions.commitmentExact,false);
  assert.equal(receipt.replicationStatus,"REPLICATION_WITHIN_TOLERANCE");
});

test("changed winning hypotheses produce REPLICATION_DIVERGED",()=>{
  const base=fixture();
  const modified=structuredClone(base.predictions);
  for(const prediction of modified){
    const ids=prediction.ranking.map(row=>row.hypothesisId).sort();
    prediction.ranking=ids.map((hypothesisId,index)=>({
      hypothesisId,
      posteriorWeight:index===2?.9:.05
    }));
  }
  const receipt=replicate(base,{predictions:modified});
  assert.ok(receipt.predictions.agreement<1);
  assert.equal(receipt.replicationStatus,"REPLICATION_DIVERGED");
});

test("seed schedule drift is an artifact mismatch",()=>{
  const receipt=replicate(fixture(),{seedSchedule:[3,6,10]});
  assert.equal(receipt.replicationStatus,"ARTIFACT_MISMATCH");
  assert.ok(receipt.artifactMismatches.includes("seedSchedule"));
});

test("tampered evaluation receipt produces insufficient evidence",()=>{
  const base=fixture();
  const submissionBundle=createIndependentSubmission(base.challengeBundle,{
    modelId:"heuristic",
    modelVersion:"0.1",
    artifactFingerprint:fingerprint({model:"ENGINEERING_HEURISTIC_V0.1"}),
    predictions:base.predictions,
    runnerAttestation:"replication"
  });
  const evaluationReceipt=scoreIndependentSubmission({
    challengeBundle:base.challengeBundle,
    custodyBundle:base.custodyBundle,
    submissionBundle,
    evaluatorReceipt:"replication:score"
  });
  evaluationReceipt.metrics.accuracy=0;

  const receipt=createReplicationReceipt(base.protocol,{
    replicatorId:"replication-lab-A",
    challengeBundle:base.challengeBundle,
    submissionBundle,
    evaluationReceipt,
    environment:ENVIRONMENT,
    sourceCommit:SOURCE_COMMIT,
    dependencyFingerprint:DEPENDENCY_FINGERPRINT,
    seedSchedule:[3,6,9]
  });
  assert.equal(receipt.replicationStatus,"INSUFFICIENT_REPLICATION_EVIDENCE");
  assert.ok(receipt.integrityErrors.includes("evaluationReceipt"));
});

test("replication receipt tampering is detectable",()=>{
  const receipt=replicate(fixture());
  const tampered=structuredClone(receipt);
  tampered.replicationStatus="REPLICATION_DIVERGED";
  assert.equal(verifyReplicationReceipt(tampered),false);
});
