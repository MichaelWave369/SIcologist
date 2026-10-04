import test from "node:test";
import assert from "node:assert/strict";
import {
  CaseFile,
  RealCaseDatasetRegistry,
  SealedEvaluationHarness,
  fingerprint,
  predictEvaluationManifest,
  verifyEvaluationReceipt
} from "../src/index.js";

function addEvalCase(registry,{
  caseId,
  lineage,
  label,
  outcomes,
  sourceRef
}){
  const file=new CaseFile({caseId,agentId:"agent-"+caseId});
  file.close("sealed evaluation source");

  const candidate=registry.ingest({
    caseSnapshot:file.snapshot(),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:lineage,
    sourceRefs:[sourceRef],
    probeOutcomes:outcomes
  });

  candidate.submitAdjudication({
    reviewerId:"a-"+caseId,
    hypothesisId:label,
    confidence:.9,
    evidenceRefs:["adjudication:a:"+caseId]
  });
  candidate.submitAdjudication({
    reviewerId:"b-"+caseId,
    hypothesisId:label,
    confidence:.9,
    evidenceRefs:["adjudication:b:"+caseId]
  });
  candidate.sealAdjudication();
  candidate.approve({
    operatorApproved:true,
    approvalReceipt:"operator:"+caseId
  });
}

function evalDataset(){
  const registry=new RealCaseDatasetRegistry();
  addEvalCase(registry,{
    caseId:"eval-1",
    lineage:"lineage-1",
    label:"H-SC-007-02",
    sourceRef:"source:eval-1",
    outcomes:{
      known_good_fixture:"NEGATIVE",
      single_retry_with_backoff:"POSITIVE"
    }
  });
  addEvalCase(registry,{
    caseId:"eval-2",
    lineage:"lineage-2",
    label:"H-SC-007-01",
    sourceRef:"source:eval-2",
    outcomes:{
      known_good_fixture:"POSITIVE",
      single_retry_with_backoff:"NEGATIVE"
    }
  });
  return registry.exportEvaluationQuarantine();
}

function freezeModel(harness){
  return harness.registerModel({
    modelId:"test-model",
    modelVersion:"1",
    artifactFingerprint:fingerprint({model:"test-model",version:"1"})
  });
}

test("manifest hides reference labels and operational source metadata",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  const manifest=harness.manifest();
  const serialized=JSON.stringify(manifest);

  assert.equal(manifest.labelsExposed,false);
  assert.equal(serialized.includes("groundTruthHypothesisId"),false);
  assert.equal(serialized.includes("H-SC-007-02"),false);
  assert.equal(serialized.includes("source:eval-1"),false);
  assert.equal(serialized.includes("approvalReceipt"),false);
});

test("evaluation dataset must remain quarantined and fingerprint-valid",()=>{
  const dataset=evalDataset();
  const badSplit=structuredClone(dataset);
  badSplit.cases[0].split="TRAIN";
  badSplit.fingerprint=fingerprint({
    version:badSplit.version,
    kind:badSplit.kind,
    externalValidity:badSplit.externalValidity,
    labelSemantics:badSplit.labelSemantics,
    cases:badSplit.cases
  });
  assert.throws(()=>new SealedEvaluationHarness(badSplit),/quarantine split/);

  const tampered=structuredClone(dataset);
  tampered.cases[0].groundTruthHypothesisId="H-SC-007-03";
  assert.throws(()=>new SealedEvaluationHarness(tampered),/fingerprint mismatch/);
});

test("model artifact must be frozen before predictions",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  const trial=harness.manifest().cases[0];

  assert.throws(()=>harness.submitPrediction({
    trialId:trial.trialId,
    ranking:[
      {hypothesisId:"H-SC-007-01",posteriorWeight:1/3},
      {hypothesisId:"H-SC-007-02",posteriorWeight:1/3},
      {hypothesisId:"H-SC-007-03",posteriorWeight:1/3}
    ]
  }),/not accepted/);

  assert.throws(()=>harness.registerModel({
    modelId:"bad",
    modelVersion:"1",
    artifactFingerprint:"abc"
  }),/64-character/);

  freezeModel(harness);
  assert.throws(()=>freezeModel(harness),/already frozen/);
});

test("prediction ranking must cover the declared hypothesis space and sum to one",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  freezeModel(harness);
  const trial=harness.manifest().cases[0];

  assert.throws(()=>harness.submitPrediction({
    trialId:trial.trialId,
    ranking:[
      {hypothesisId:"H-SC-007-01",posteriorWeight:.5},
      {hypothesisId:"H-SC-007-02",posteriorWeight:.5}
    ]
  }),/every declared hypothesis/);

  assert.throws(()=>harness.submitPrediction({
    trialId:trial.trialId,
    ranking:[
      {hypothesisId:"H-SC-007-01",posteriorWeight:.4},
      {hypothesisId:"H-SC-007-02",posteriorWeight:.4},
      {hypothesisId:"H-SC-007-03",posteriorWeight:.4}
    ]
  }),/sum to 1/);
});

test("prediction commit requires complete coverage and freezes submissions",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  freezeModel(harness);
  const predictions=predictEvaluationManifest(harness.manifest());

  harness.submitPrediction(predictions[0]);
  assert.throws(()=>harness.commitPredictions(),/Every evaluation case/);

  harness.submitPrediction(predictions[1]);
  const receipt=harness.commitPredictions();
  assert.equal(receipt.predictionCount,2);
  assert.equal(receipt.labelsExposed,false);

  assert.throws(()=>harness.submitPrediction(predictions[0]),/not accepted/);
});

test("runner consumes only label-hidden public manifest",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  const manifest=harness.manifest();
  assert.equal(manifest.labelsExposed,false);

  const predictions=predictEvaluationManifest(manifest);
  assert.equal(predictions.length,2);
  assert.equal(JSON.stringify(predictions).includes("truth"),false);
});

test("labels cannot be revealed before prediction commitment",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  freezeModel(harness);

  assert.throws(()=>harness.revealAndScore({
    revealAuthorized:true,
    revealReceipt:"operator:early"
  }),/committed/);
});

test("reveal requires explicit authorization and receipt",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  freezeModel(harness);
  for(const prediction of predictEvaluationManifest(harness.manifest())){
    harness.submitPrediction(prediction);
  }
  harness.commitPredictions();

  assert.throws(()=>harness.revealAndScore(),/authorization/);
  assert.throws(()=>harness.revealAndScore({
    revealAuthorized:true,
    revealReceipt:""
  }),/reveal receipt/);
});

test("closed receipt scores committed predictions and verifies its fingerprint",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  freezeModel(harness);
  for(const prediction of predictEvaluationManifest(harness.manifest())){
    harness.submitPrediction(prediction);
  }
  const commitment=harness.commitPredictions();
  const report=harness.revealAndScore({
    revealAuthorized:true,
    revealReceipt:"operator:reveal"
  });

  assert.equal(report.phase,"CLOSED");
  assert.equal(report.labelRevealTiming,"AFTER_PREDICTION_COMMIT");
  assert.equal(report.predictionsCommitment,commitment.predictionsCommitment);
  assert.equal(report.metrics.cases,2);
  assert.ok(report.metrics.accuracy>=0&&report.metrics.accuracy<=1);
  assert.ok(report.metrics.multiclassBrier>=0);
  assert.ok(report.metrics.logLoss>=0);
  assert.equal(report.integrity.labelCommitmentVerified,true);
  assert.equal(report.custodyIndependence,"NOT_ESTABLISHED");
  assert.equal(report.productionStatus,"NOT_VALIDATED");
  assert.equal(verifyEvaluationReceipt(report),true);
});

test("receipt tampering is detectable",()=>{
  const harness=new SealedEvaluationHarness(evalDataset());
  freezeModel(harness);
  for(const prediction of predictEvaluationManifest(harness.manifest())){
    harness.submitPrediction(prediction);
  }
  harness.commitPredictions();
  const report=harness.revealAndScore({
    revealAuthorized:true,
    revealReceipt:"operator:reveal"
  });
  const tampered=structuredClone(report);
  tampered.metrics.accuracy=0;
  assert.equal(verifyEvaluationReceipt(tampered),false);
});

test("commitments are deterministic for same dataset model and predictions",()=>{
  function run(){
    const harness=new SealedEvaluationHarness(evalDataset());
    const model=freezeModel(harness);
    for(const prediction of predictEvaluationManifest(harness.manifest())){
      harness.submitPrediction(prediction);
    }
    const predictionCommit=harness.commitPredictions();
    const report=harness.revealAndScore({
      revealAuthorized:true,
      revealReceipt:"operator:deterministic"
    });
    return {
      harnessId:harness.id(),
      modelCommitment:model.modelCommitment,
      predictionsCommitment:predictionCommit.predictionsCommitment,
      labelCommitment:report.labelCommitment,
      fingerprint:report.fingerprint
    };
  }

  assert.deepEqual(run(),run());
});
