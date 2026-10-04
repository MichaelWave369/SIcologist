import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {
  CaseFile,
  RealCaseDatasetRegistry,
  createIndependentCustodySplit,
  createIndependentSubmission,
  fingerprint,
  predictIndependentChallenge,
  scoreIndependentSubmission,
  signIndependentEvaluationReceipt,
  verifyEvaluatorSignature,
  verifyIndependentEvaluationReceipt
} from "../src/index.js";

function addEvalCase(registry,{caseId,lineage,label,outcomes,sourceRef}){
  const file=new CaseFile({caseId,agentId:"agent-"+caseId});
  file.close("ready for independent custody evaluation");

  const candidate=registry.ingest({
    caseSnapshot:file.snapshot(),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:lineage,
    sourceRefs:[sourceRef],
    probeOutcomes:outcomes
  });

  for(const reviewerId of ["a","b"]){
    candidate.submitAdjudication({
      reviewerId:reviewerId+"-"+caseId,
      hypothesisId:label,
      confidence:.9,
      evidenceRefs:["adj:"+reviewerId+":"+caseId]
    });
  }
  candidate.sealAdjudication();
  candidate.approve({
    operatorApproved:true,
    approvalReceipt:"operator:"+caseId
  });
}

function dataset(){
  const registry=new RealCaseDatasetRegistry();
  addEvalCase(registry,{
    caseId:"custody-1",
    lineage:"custody-lineage-1",
    label:"H-SC-007-02",
    sourceRef:"source:custody-1",
    outcomes:{
      known_good_fixture:"NEGATIVE",
      single_retry_with_backoff:"POSITIVE"
    }
  });
  addEvalCase(registry,{
    caseId:"custody-2",
    lineage:"custody-lineage-2",
    label:"H-SC-007-01",
    sourceRef:"source:custody-2",
    outcomes:{
      known_good_fixture:"POSITIVE",
      single_retry_with_backoff:"NEGATIVE"
    }
  });
  return registry.exportEvaluationQuarantine();
}

function split(){
  return createIndependentCustodySplit(dataset(),{
    evaluatorId:"independent-evaluator-A",
    protocolNote:"held by evaluator"
  });
}

function submission(challengeBundle){
  const predictions=predictIndependentChallenge(challengeBundle);
  return createIndependentSubmission(challengeBundle,{
    modelId:"heuristic",
    modelVersion:"0.1",
    artifactFingerprint:fingerprint({model:"ENGINEERING_HEURISTIC_V0.1"}),
    predictions,
    runnerAttestation:"runner saw challenge bundle only"
  });
}

test("public challenge excludes labels and private source metadata",()=>{
  const {challengeBundle}=split();
  const serialized=JSON.stringify(challengeBundle);
  assert.equal(challengeBundle.labelsExposed,false);
  assert.equal(serialized.includes("groundTruthHypothesisId"),false);
  assert.equal(serialized.includes("H-SC-007-02"),false);
  assert.equal(serialized.includes("source:custody-1"),false);
  assert.equal(serialized.includes("approvalReceipt"),false);
});

test("private custody carries committed adjudicated references",()=>{
  const {challengeBundle,custodyBundle}=split();
  assert.equal(custodyBundle.labels.length,2);
  assert.equal(custodyBundle.labelCommitment,challengeBundle.labelCommitment);
  assert.ok(JSON.stringify(custodyBundle).includes("H-SC-007-02"));
});

test("challenge and custody fingerprints detect tampering",()=>{
  const {challengeBundle,custodyBundle}=split();
  const badChallenge=structuredClone(challengeBundle);
  badChallenge.cases[0].outcomes.known_good_fixture="POSITIVE";
  assert.throws(()=>createIndependentSubmission(badChallenge,{
    modelId:"m",
    modelVersion:"1",
    artifactFingerprint:"0".repeat(64),
    predictions:[]
  }),/Challenge fingerprint mismatch/);

  const badCustody=structuredClone(custodyBundle);
  badCustody.labels[0].referenceHypothesisId="H-SC-007-03";
  const sub=submission(challengeBundle);
  assert.throws(()=>scoreIndependentSubmission({
    challengeBundle,
    custodyBundle:badCustody,
    submissionBundle:sub,
    evaluatorReceipt:"eval:test"
  }),/Custody fingerprint mismatch/);
});

test("independent runner consumes only public challenge bundle",()=>{
  const {challengeBundle}=split();
  const predictions=predictIndependentChallenge(challengeBundle);
  assert.equal(predictions.length,2);
  assert.equal(JSON.stringify(predictions).includes("referenceHypothesisId"),false);
  assert.equal(JSON.stringify(predictions).includes("truth"),false);
});

test("submission freezes model artifact and full prediction set",()=>{
  const {challengeBundle}=split();
  const sub=submission(challengeBundle);

  assert.equal(sub.labelsSeen,false);
  assert.equal(sub.predictions.length,challengeBundle.caseCount);
  assert.equal(typeof sub.modelCommitment,"string");
  assert.equal(typeof sub.predictionsCommitment,"string");
  assert.equal(sub.challengeFingerprint,challengeBundle.fingerprint);
});

test("submission rejects incomplete or malformed predictions",()=>{
  const {challengeBundle}=split();
  const predictions=predictIndependentChallenge(challengeBundle);

  assert.throws(()=>createIndependentSubmission(challengeBundle,{
    modelId:"m",
    modelVersion:"1",
    artifactFingerprint:"0".repeat(64),
    predictions:predictions.slice(0,1)
  }),/Every challenge case/);

  const malformed=structuredClone(predictions);
  malformed[0].ranking[0].posteriorWeight=.9;
  assert.throws(()=>createIndependentSubmission(challengeBundle,{
    modelId:"m",
    modelVersion:"1",
    artifactFingerprint:"0".repeat(64),
    predictions:malformed
  }),/sum to 1/);
});

test("scoring verifies split packages and committed submission",()=>{
  const {challengeBundle,custodyBundle}=split();
  const sub=submission(challengeBundle);
  const receipt=scoreIndependentSubmission({
    challengeBundle,
    custodyBundle,
    submissionBundle:sub,
    evaluatorReceipt:"evaluator:scored"
  });

  assert.equal(receipt.labelRevealTiming,"AFTER_EXTERNAL_SUBMISSION_COMMIT");
  assert.equal(receipt.custodySeparation,"SPLIT_PACKAGE_VERIFIED");
  assert.equal(receipt.custodyIndependence,"NOT_ESTABLISHED");
  assert.equal(receipt.metrics.cases,2);
  assert.ok(receipt.metrics.accuracy>=0&&receipt.metrics.accuracy<=1);
  assert.equal(receipt.integrity.labelsAbsentFromSubmission,true);
  assert.equal(verifyIndependentEvaluationReceipt(receipt),true);
});

test("submission tampering is rejected before scoring",()=>{
  const {challengeBundle,custodyBundle}=split();
  const sub=submission(challengeBundle);
  const tampered=structuredClone(sub);
  tampered.predictions[0].ranking[0].posteriorWeight=.99;

  assert.throws(()=>scoreIndependentSubmission({
    challengeBundle,
    custodyBundle,
    submissionBundle:tampered,
    evaluatorReceipt:"evaluator:tamper"
  }),/Submission fingerprint mismatch/);
});

test("evaluation receipt tampering is detectable",()=>{
  const {challengeBundle,custodyBundle}=split();
  const receipt=scoreIndependentSubmission({
    challengeBundle,
    custodyBundle,
    submissionBundle:submission(challengeBundle),
    evaluatorReceipt:"evaluator:receipt"
  });
  const tampered=structuredClone(receipt);
  tampered.metrics.accuracy=0;
  assert.equal(verifyIndependentEvaluationReceipt(tampered),false);
});

test("Ed25519 signature verifies the immutable scored receipt",()=>{
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const publicKeyPem=publicKey.export({type:"spki",format:"pem"});
  const privateKeyPem=privateKey.export({type:"pkcs8",format:"pem"});

  const {challengeBundle,custodyBundle}=split();
  const receipt=scoreIndependentSubmission({
    challengeBundle,
    custodyBundle,
    submissionBundle:submission(challengeBundle),
    evaluatorReceipt:"evaluator:signed"
  });

  const signature=signIndependentEvaluationReceipt(receipt,{
    evaluatorId:"independent-evaluator-A",
    privateKeyPem,
    publicKeyPem
  });

  assert.equal(verifyEvaluatorSignature(receipt,signature,publicKeyPem),true);

  const tampered=structuredClone(receipt);
  tampered.metrics.accuracy=0;
  assert.equal(verifyEvaluatorSignature(tampered,signature,publicKeyPem),false);
});

test("same inputs create deterministic split submission and receipt",()=>{
  function run(){
    const {challengeBundle,custodyBundle}=split();
    const sub=submission(challengeBundle);
    const receipt=scoreIndependentSubmission({
      challengeBundle,
      custodyBundle,
      submissionBundle:sub,
      evaluatorReceipt:"evaluator:deterministic"
    });
    return {
      challenge:challengeBundle.fingerprint,
      custody:custodyBundle.fingerprint,
      submission:sub.fingerprint,
      receipt:receipt.fingerprint
    };
  }
  assert.deepEqual(run(),run());
});
