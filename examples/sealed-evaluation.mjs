import {
  CaseFile,
  RealCaseDatasetRegistry,
  SealedEvaluationHarness,
  fingerprint,
  predictEvaluationManifest
} from "../src/index.js";

function approvedEvalCase(registry,index,label,outcomes){
  const file=new CaseFile({
    caseId:"eval-case-"+index,
    agentId:"example-agent-"+index
  });
  file.addNote("Example operational case.");
  file.close("ready for sealed evaluation");

  const candidate=registry.ingest({
    caseSnapshot:file.snapshot(),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"eval-lineage-"+index,
    sourceRefs:["eval-source:"+index],
    probeOutcomes:outcomes
  });

  for(const reviewerId of ["reviewer-a","reviewer-b"]){
    candidate.submitAdjudication({
      reviewerId:reviewerId+"-"+index,
      hypothesisId:label,
      confidence:.9,
      evidenceRefs:["adjudication:"+reviewerId+":"+index]
    });
  }
  candidate.sealAdjudication();
  candidate.approve({
    operatorApproved:true,
    approvalReceipt:"operator:eval:"+index
  });
}

const registry=new RealCaseDatasetRegistry();

approvedEvalCase(registry,1,"H-SC-007-02",{
  known_good_fixture:"NEGATIVE",
  single_retry_with_backoff:"POSITIVE"
});

approvedEvalCase(registry,2,"H-SC-007-01",{
  known_good_fixture:"POSITIVE",
  single_retry_with_backoff:"NEGATIVE"
});

const harness=new SealedEvaluationHarness(
  registry.exportEvaluationQuarantine()
);

harness.registerModel({
  modelId:"engineering-heuristic",
  modelVersion:"v0.1",
  artifactFingerprint:fingerprint({model:"ENGINEERING_HEURISTIC_V0.1"})
});

const predictions=predictEvaluationManifest(harness.manifest());
for(const prediction of predictions) harness.submitPrediction(prediction);

harness.commitPredictions();

console.log(JSON.stringify(
  harness.revealAndScore({
    revealAuthorized:true,
    revealReceipt:"operator:reveal:example"
  }),
  null,
  2
));
