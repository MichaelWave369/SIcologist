import {
  CaseFile,
  RealCaseDatasetRegistry
} from "../src/index.js";

const file=new CaseFile({
  caseId:"real-example-001",
  agentId:"builder-07",
  title:"tool retry incident"
});
file.addNote("Operational evidence remains in the case ledger.");
file.close("ready for research intake");

const registry=new RealCaseDatasetRegistry();

const candidate=registry.ingest({
  caseSnapshot:file.snapshot(),
  conditionId:"SC-007",
  datasetUse:"EVAL_QUARANTINE",
  lineageKey:"incident-family-001",
  sourceRefs:["tool-log:17","fixture-run:known-good"],
  probeOutcomes:{
    known_good_fixture:"NEGATIVE",
    single_retry_with_backoff:"POSITIVE"
  }
});

candidate.submitAdjudication({
  reviewerId:"reviewer-a",
  hypothesisId:"H-SC-007-02",
  confidence:.9,
  evidenceRefs:["tool-log:17"]
});

candidate.submitAdjudication({
  reviewerId:"reviewer-b",
  hypothesisId:"H-SC-007-02",
  confidence:.85,
  evidenceRefs:["fixture-run:known-good"]
});

candidate.sealAdjudication();
candidate.approve({
  operatorApproved:true,
  approvalReceipt:"operator:example"
});

console.log(JSON.stringify({
  audit:registry.audit(),
  evaluationQuarantine:registry.exportEvaluationQuarantine()
},null,2));
