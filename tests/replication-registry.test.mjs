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
  ReplicationEvidenceRegistry,
  fingerprint
} from "../src/index.js";

const SOURCE_COMMIT="1".repeat(40);
const DEPENDENCY_FINGERPRINT="2".repeat(64);
const BASE_ENV={
  os:"linux",
  arch:"x64",
  runtimeFamily:"node",
  runtimeVersion:"24.0.0",
  hardwareClass:"reference"
};

function source(){
  const registry=new RealCaseDatasetRegistry();
  for(const [index,label,outcomes] of [
    [1,"H-SC-007-02",{known_good_fixture:"NEGATIVE",single_retry_with_backoff:"POSITIVE"}],
    [2,"H-SC-007-01",{known_good_fixture:"POSITIVE",single_retry_with_backoff:"NEGATIVE"}]
  ]){
    const file=new CaseFile({caseId:"reg-"+index,agentId:"agent-"+index});
    file.close("registry fixture");
    const candidate=registry.ingest({
      caseSnapshot:file.snapshot(),
      conditionId:"SC-007",
      datasetUse:"EVAL_QUARANTINE",
      lineageKey:"registry-lineage-"+index,
      sourceRefs:["registry-source:"+index],
      probeOutcomes:outcomes
    });
    for(const reviewer of ["a","b"]){
      candidate.submitAdjudication({
        reviewerId:reviewer+"-"+index,
        hypothesisId:label,
        confidence:.9,
        evidenceRefs:["review:"+reviewer+":"+index]
      });
    }
    candidate.sealAdjudication();
    candidate.approve({operatorApproved:true,approvalReceipt:"operator:"+index});
  }

  const {challengeBundle,custodyBundle}=createIndependentCustodySplit(
    registry.exportEvaluationQuarantine(),
    {evaluatorId:"reference-evaluator"}
  );
  const predictions=predictIndependentChallenge(challengeBundle);
  const artifactFingerprint=fingerprint({model:"ENGINEERING_HEURISTIC_V0.1"});
  const referenceSubmission=createIndependentSubmission(challengeBundle,{
    modelId:"heuristic",
    modelVersion:"0.1",
    artifactFingerprint,
    predictions,
    runnerAttestation:"reference"
  });
  const referenceReceipt=scoreIndependentSubmission({
    challengeBundle,
    custodyBundle,
    submissionBundle:referenceSubmission,
    evaluatorReceipt:"reference"
  });
  const protocol=createReplicationProtocol({
    referenceReceipt,
    challengeBundle,
    sourceCommit:SOURCE_COMMIT,
    dependencyFingerprint:DEPENDENCY_FINGERPRINT,
    referenceEnvironment:BASE_ENV,
    seedSchedule:[3,6,9]
  });
  return {challengeBundle,custodyBundle,predictions,artifactFingerprint,protocol};
}

function makeReceipt(base,{
  replicatorId,
  environment=BASE_ENV,
  predictions=base.predictions,
  evaluatorReceipt="eval-"+replicatorId,
  sourceCommit=SOURCE_COMMIT
}){
  const submission=createIndependentSubmission(base.challengeBundle,{
    modelId:"heuristic",
    modelVersion:"0.1",
    artifactFingerprint:base.artifactFingerprint,
    predictions,
    runnerAttestation:"runner-"+replicatorId
  });
  const evaluation=scoreIndependentSubmission({
    challengeBundle:base.challengeBundle,
    custodyBundle:base.custodyBundle,
    submissionBundle:submission,
    evaluatorReceipt
  });
  return createReplicationReceipt(base.protocol,{
    replicatorId,
    challengeBundle:base.challengeBundle,
    submissionBundle:submission,
    evaluationReceipt:evaluation,
    environment,
    sourceCommit,
    dependencyFingerprint:DEPENDENCY_FINGERPRINT,
    seedSchedule:[3,6,9]
  });
}

function divergentPredictions(base){
  const changed=structuredClone(base.predictions);
  for(const prediction of changed){
    const ids=prediction.ranking.map(row=>row.hypothesisId).sort();
    prediction.ranking=ids.map((hypothesisId,index)=>({
      hypothesisId,
      posteriorWeight:index===2?.9:.05
    }));
  }
  return changed;
}

test("empty registry begins with no replication evidence",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  const summary=registry.summary();
  assert.equal(summary.evidenceGrade,"NO_REPLICATION_EVIDENCE");
  assert.equal(summary.registeredReceiptCount,0);
  assert.equal(summary.evidenceBoundary.replicationIndependence,"NOT_ESTABLISHED");
});

test("ladder promotes through single multi cross-environment and robust candidate",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);

  registry.register(makeReceipt(base,{replicatorId:"lab-a"}));
  assert.equal(registry.summary().evidenceGrade,"SINGLE_REPLICATION_SUPPORT");

  registry.register(makeReceipt(base,{replicatorId:"lab-b",environment:{...BASE_ENV,os:"windows"}}));
  assert.equal(registry.summary().evidenceGrade,"MULTI_REPLICATOR_SUPPORT");

  registry.register(makeReceipt(base,{replicatorId:"lab-c",environment:{...BASE_ENV,hardwareClass:"gpu"}}));
  assert.equal(registry.summary().evidenceGrade,"CROSS_ENVIRONMENT_SUPPORT");

  registry.register(makeReceipt(base,{replicatorId:"lab-d",environment:{...BASE_ENV,os:"macos",arch:"arm64"}}));
  registry.register(makeReceipt(base,{replicatorId:"lab-e",environment:{...BASE_ENV,os:"freebsd",hardwareClass:"cpu-only"}}));

  const summary=registry.summary();
  assert.equal(summary.evidenceGrade,"ROBUST_REPLICATION_CANDIDATE");
  assert.equal(summary.supportReplicatorCount,5);
  assert.ok(summary.supportEnvironmentCount>=3);
  assert.equal(summary.promotionStatus,"EVIDENCE_LADDER_TOP_CANDIDATE");
  assert.equal(summary.evidenceBoundary.scientificTruth,"NOT_ESTABLISHED");
});

test("same declared replicator does not inflate replicator support",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  registry.register(makeReceipt(base,{replicatorId:"lab-a",evaluatorReceipt:"run-1"}));
  registry.register(makeReceipt(base,{replicatorId:"lab-a",evaluatorReceipt:"run-2"}));
  const summary=registry.summary();
  assert.equal(summary.registeredReceiptCount,2);
  assert.equal(summary.supportReplicatorCount,1);
  assert.equal(summary.evidenceGrade,"SINGLE_REPLICATION_SUPPORT");
});

test("reused observed evidence is detected and counted once",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  const submission=createIndependentSubmission(base.challengeBundle,{
    modelId:"heuristic",
    modelVersion:"0.1",
    artifactFingerprint:base.artifactFingerprint,
    predictions:base.predictions,
    runnerAttestation:"shared"
  });
  const evaluation=scoreIndependentSubmission({
    challengeBundle:base.challengeBundle,
    custodyBundle:base.custodyBundle,
    submissionBundle:submission,
    evaluatorReceipt:"shared-evidence"
  });

  for(const replicatorId of ["lab-a","lab-b"]){
    registry.register(createReplicationReceipt(base.protocol,{
      replicatorId,
      challengeBundle:base.challengeBundle,
      submissionBundle:submission,
      evaluationReceipt:evaluation,
      environment:BASE_ENV,
      sourceCommit:SOURCE_COMMIT,
      dependencyFingerprint:DEPENDENCY_FINGERPRINT,
      seedSchedule:[3,6,9]
    }));
  }

  const summary=registry.summary();
  assert.equal(summary.registeredReceiptCount,2);
  assert.equal(summary.uniqueEvidenceCount,1);
  assert.equal(summary.duplicateEvidenceReuseCount,1);
  assert.equal(summary.supportReplicatorCount,1);
});

test("divergent evidence stays visible and lowers promotion",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  for(const [id,env] of [
    ["lab-a",BASE_ENV],
    ["lab-b",{...BASE_ENV,os:"windows"}],
    ["lab-c",{...BASE_ENV,hardwareClass:"gpu"}],
    ["lab-d",{...BASE_ENV,os:"macos"}]
  ]){
    registry.register(makeReceipt(base,{replicatorId:id,environment:env}));
  }
  registry.register(makeReceipt(base,{
    replicatorId:"lab-e",
    predictions:divergentPredictions(base)
  }));
  registry.register(makeReceipt(base,{
    replicatorId:"lab-f",
    predictions:divergentPredictions(base),
    evaluatorReceipt:"divergence-two"
  }));

  const summary=registry.summary();
  assert.equal(summary.divergenceCount,2);
  assert.equal(summary.supportRate,0.666666667);
  assert.equal(summary.evidenceGrade,"MULTI_REPLICATOR_SUPPORT");
  assert.equal(summary.adverseEvidence.filter(x=>x.status==="REPLICATION_DIVERGED").length,2);
});

test("artifact mismatch is preserved but not treated as comparable divergence",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  registry.register(makeReceipt(base,{replicatorId:"lab-a"}));
  registry.register(makeReceipt(base,{
    replicatorId:"lab-b",
    sourceCommit:"3".repeat(40)
  }));
  const summary=registry.summary();
  assert.equal(summary.statusCounts.ARTIFACT_MISMATCH,1);
  assert.equal(summary.comparableCount,1);
  assert.equal(summary.divergenceCount,0);
  assert.equal(summary.adverseEvidence.length,1);
});

test("exact duplicate receipt is rejected",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  const receipt=makeReceipt(base,{replicatorId:"lab-a"});
  registry.register(receipt);
  assert.throws(()=>registry.register(receipt),/DUPLICATE_REPLICATION_RECEIPT/);
});

test("receipt from another protocol is rejected",()=>{
  const base=source();
  const other=source();
  const alteredProtocol=structuredClone(other.protocol);
  alteredProtocol.seedSchedule=[1,2,3];
  const {fingerprint:ignored,...body}=alteredProtocol;
  alteredProtocol.fingerprint=fingerprint(body);

  const registry=new ReplicationEvidenceRegistry(alteredProtocol);
  const receipt=makeReceipt(base,{replicatorId:"lab-a"});
  assert.throws(()=>registry.register(receipt),/different replication protocol/);
});

test("registry export and restore are deterministic",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  registry.register(makeReceipt(base,{replicatorId:"lab-a"}));
  registry.register(makeReceipt(base,{replicatorId:"lab-b",environment:{...BASE_ENV,os:"windows"}}));

  const snapshot=registry.export();
  const restored=ReplicationEvidenceRegistry.fromSnapshot(snapshot);
  assert.deepEqual(restored.export(),snapshot);
  assert.deepEqual(restored.summary(),registry.summary());
});

test("heterogeneity reports metric deltas and prediction agreement",()=>{
  const base=source();
  const registry=new ReplicationEvidenceRegistry(base.protocol);
  registry.register(makeReceipt(base,{replicatorId:"lab-a"}));
  registry.register(makeReceipt(base,{
    replicatorId:"lab-b",
    predictions:divergentPredictions(base)
  }));
  const h=registry.summary().heterogeneity;
  assert.equal(h.metrics.accuracy.n,2);
  assert.equal(h.predictionAgreement.n,2);
  assert.ok(h.predictionAgreement.min<h.predictionAgreement.max);
});
