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
  verifyEvaluatorSignature
} from "../src/index.js";

const registry=new RealCaseDatasetRegistry();

function add(index,label,outcomes){
  const file=new CaseFile({
    caseId:"external-"+index,
    agentId:"example-agent-"+index
  });
  file.close("external evaluation candidate");

  const candidate=registry.ingest({
    caseSnapshot:file.snapshot(),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"external-lineage-"+index,
    sourceRefs:["external-source:"+index],
    probeOutcomes:outcomes
  });

  for(const reviewer of ["a","b"]){
    candidate.submitAdjudication({
      reviewerId:reviewer+"-"+index,
      hypothesisId:label,
      confidence:.9,
      evidenceRefs:["adjudication:"+reviewer+":"+index]
    });
  }
  candidate.sealAdjudication();
  candidate.approve({
    operatorApproved:true,
    approvalReceipt:"operator:"+index
  });
}

add(1,"H-SC-007-02",{
  known_good_fixture:"NEGATIVE",
  single_retry_with_backoff:"POSITIVE"
});

add(2,"H-SC-007-01",{
  known_good_fixture:"POSITIVE",
  single_retry_with_backoff:"NEGATIVE"
});

const {challengeBundle,custodyBundle}=createIndependentCustodySplit(
  registry.exportEvaluationQuarantine(),
  {evaluatorId:"external-evaluator-demo"}
);

const predictions=predictIndependentChallenge(challengeBundle);

const submissionBundle=createIndependentSubmission(challengeBundle,{
  modelId:"engineering-heuristic",
  modelVersion:"0.1",
  artifactFingerprint:fingerprint({model:"ENGINEERING_HEURISTIC_V0.1"}),
  predictions,
  runnerAttestation:"challenge bundle only"
});

const receipt=scoreIndependentSubmission({
  challengeBundle,
  custodyBundle,
  submissionBundle,
  evaluatorReceipt:"evaluator:demo"
});

const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const publicKeyPem=publicKey.export({type:"spki",format:"pem"});
const privateKeyPem=privateKey.export({type:"pkcs8",format:"pem"});

const signature=signIndependentEvaluationReceipt(receipt,{
  evaluatorId:"external-evaluator-demo",
  privateKeyPem,
  publicKeyPem
});

console.log(JSON.stringify({
  challengeBundle,
  submissionBundle,
  receipt,
  signatureVerified:verifyEvaluatorSignature(receipt,signature,publicKeyPem)
},null,2));
