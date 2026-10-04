import {
  CaseFile,
  RealCaseDatasetRegistry,
  createIndependentCustodySplit,
  createIndependentSubmission,
  scoreIndependentSubmission,
  predictIndependentChallenge,
  createReplicationProtocol,
  createReplicationReceipt,
  fingerprint
} from "../src/index.js";

const registry=new RealCaseDatasetRegistry();

for(const [index,label,outcomes] of [
  [1,"H-SC-007-02",{known_good_fixture:"NEGATIVE",single_retry_with_backoff:"POSITIVE"}],
  [2,"H-SC-007-01",{known_good_fixture:"POSITIVE",single_retry_with_backoff:"NEGATIVE"}]
]){
  const file=new CaseFile({caseId:"repro-"+index,agentId:"agent-"+index});
  file.close("replication example");
  const candidate=registry.ingest({
    caseSnapshot:file.snapshot(),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"repro-lineage-"+index,
    sourceRefs:["repro-source:"+index],
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
  {evaluatorId:"reference-lab"}
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
  evaluatorReceipt:"reference:complete"
});

const environment={
  os:"linux",
  arch:"x64",
  runtimeFamily:"node",
  runtimeVersion:"24.0.0",
  hardwareClass:"reference"
};

const protocol=createReplicationProtocol({
  referenceReceipt,
  challengeBundle,
  sourceCommit:"1".repeat(40),
  dependencyFingerprint:"2".repeat(64),
  referenceEnvironment:environment,
  seedSchedule:[3,6,9]
});

const replicationSubmission=createIndependentSubmission(challengeBundle,{
  modelId:"heuristic",
  modelVersion:"0.1",
  artifactFingerprint,
  predictions,
  runnerAttestation:"replication lab"
});
const replicationEvaluation=scoreIndependentSubmission({
  challengeBundle,
  custodyBundle,
  submissionBundle:replicationSubmission,
  evaluatorReceipt:"replication:complete"
});
const receipt=createReplicationReceipt(protocol,{
  replicatorId:"replication-lab-A",
  challengeBundle,
  submissionBundle:replicationSubmission,
  evaluationReceipt:replicationEvaluation,
  environment:{...environment,os:"windows"},
  sourceCommit:"1".repeat(40),
  dependencyFingerprint:"2".repeat(64),
  seedSchedule:[3,6,9]
});

console.log(JSON.stringify(receipt,null,2));
