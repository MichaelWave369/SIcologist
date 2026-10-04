import test from "node:test";
import assert from "node:assert/strict";
import {
  CaseFile,
  RealCaseDatasetRegistry,
  fitEmpiricalDifferentialModel
} from "../src/index.js";

function closedCase(caseId="case-1",agentId="builder-07"){
  const file=new CaseFile({caseId,agentId});
  file.addNote("source evidence retained in operational case");
  file.close("research intake candidate");
  return file.snapshot();
}

const outcomes={
  known_good_fixture:"NEGATIVE",
  single_retry_with_backoff:"POSITIVE"
};

function adjudicate(candidate,label="H-SC-007-02"){
  candidate.submitAdjudication({
    reviewerId:"reviewer-a",
    hypothesisId:label,
    confidence:.9,
    evidenceRefs:["review-evidence:a"]
  });
  candidate.submitAdjudication({
    reviewerId:"reviewer-b",
    hypothesisId:label,
    confidence:.85,
    evidenceRefs:["review-evidence:b"]
  });
  return candidate.sealAdjudication();
}

test("intake requires closed ledger-valid cases",()=>{
  const open=new CaseFile({caseId:"open",agentId:"agent"}).snapshot();
  const registry=new RealCaseDatasetRegistry();

  assert.throws(()=>registry.ingest({
    caseSnapshot:open,
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"lineage-open",
    sourceRefs:["src:open"],
    probeOutcomes:outcomes
  }),/CLOSED/);

  const closed=closedCase("tamper");
  closed.ledgerValid=false;
  assert.throws(()=>registry.ingest({
    caseSnapshot:closed,
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"lineage-tamper",
    sourceRefs:["src:tamper"],
    probeOutcomes:outcomes
  }),/ledger/);
});

test("blind adjudication snapshot hides peer labels",()=>{
  const registry=new RealCaseDatasetRegistry();
  const candidate=registry.ingest({
    caseSnapshot:closedCase("blind"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"lineage-blind",
    sourceRefs:["src:blind"],
    probeOutcomes:outcomes
  });

  candidate.submitAdjudication({
    reviewerId:"reviewer-a",
    hypothesisId:"H-SC-007-02",
    confidence:.9,
    evidenceRefs:["evidence:a"]
  });

  const snapshot=candidate.blindSnapshot();
  const serialized=JSON.stringify(snapshot);
  assert.equal(snapshot.peerLabelsExposed,false);
  assert.equal(serialized.includes("H-SC-007-02"),false);
  assert.equal(serialized.includes("evidence:a"),false);
});

test("disputed adjudication cannot be approved",()=>{
  const registry=new RealCaseDatasetRegistry();
  const candidate=registry.ingest({
    caseSnapshot:closedCase("dispute"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"lineage-dispute",
    sourceRefs:["src:dispute"],
    probeOutcomes:outcomes
  });

  candidate.submitAdjudication({
    reviewerId:"reviewer-a",
    hypothesisId:"H-SC-007-01",
    confidence:.8,
    evidenceRefs:["e:a"]
  });
  candidate.submitAdjudication({
    reviewerId:"reviewer-b",
    hypothesisId:"H-SC-007-02",
    confidence:.8,
    evidenceRefs:["e:b"]
  });

  candidate.sealAdjudication();
  assert.equal(candidate.status(),"DISPUTED");
  assert.throws(()=>candidate.approve({
    operatorApproved:true,
    approvalReceipt:"operator:test"
  }),/ADJUDICATED/);
});

test("approval requires complete probes operator approval and receipt",()=>{
  const registry=new RealCaseDatasetRegistry();
  const candidate=registry.ingest({
    caseSnapshot:closedCase("approve"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"lineage-approve",
    sourceRefs:["src:approve"],
    probeOutcomes:outcomes
  });

  adjudicate(candidate);
  assert.throws(()=>candidate.approve(),/Operator approval/);
  assert.throws(()=>candidate.approve({
    operatorApproved:true,
    approvalReceipt:""
  }),/approval receipt/);

  candidate.approve({
    operatorApproved:true,
    approvalReceipt:"operator:approved"
  });
  assert.equal(candidate.status(),"APPROVED");
});

test("incomplete probe outcomes block promotion",()=>{
  const registry=new RealCaseDatasetRegistry();
  const candidate=registry.ingest({
    caseSnapshot:closedCase("incomplete"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"lineage-incomplete",
    sourceRefs:["src:incomplete"],
    probeOutcomes:{known_good_fixture:"NEGATIVE"}
  });

  adjudicate(candidate);
  assert.throws(()=>candidate.approve({
    operatorApproved:true,
    approvalReceipt:"operator:test"
  }),/Complete/);
});

test("exact duplicate sources are rejected",()=>{
  const registry=new RealCaseDatasetRegistry();
  const snapshot=closedCase("duplicate");
  const common={
    caseSnapshot:snapshot,
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"lineage-duplicate",
    sourceRefs:["src:duplicate"],
    probeOutcomes:outcomes
  };
  registry.ingest(common);
  assert.throws(()=>registry.ingest(common),/EXACT_SOURCE_DUPLICATE/);
});

test("lineage cannot cross training and evaluation",()=>{
  const registry=new RealCaseDatasetRegistry();
  registry.ingest({
    caseSnapshot:closedCase("lineage-train"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"same-family",
    sourceRefs:["src:train-only"],
    probeOutcomes:outcomes
  });

  assert.throws(()=>registry.ingest({
    caseSnapshot:closedCase("lineage-eval"),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"same-family",
    sourceRefs:["src:eval-only"],
    probeOutcomes:outcomes
  }),/LINEAGE_SPLIT_COLLISION/);
});

test("evidence reference cannot cross training and evaluation",()=>{
  const registry=new RealCaseDatasetRegistry();
  registry.ingest({
    caseSnapshot:closedCase("evidence-train"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"family-a",
    sourceRefs:["shared:evidence"],
    probeOutcomes:outcomes
  });

  assert.throws(()=>registry.ingest({
    caseSnapshot:closedCase("evidence-eval"),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"family-b",
    sourceRefs:["shared:evidence"],
    probeOutcomes:outcomes
  }),/EVIDENCE_SPLIT_COLLISION/);
});

test("approved exports preserve train versus evaluation quarantine",()=>{
  const registry=new RealCaseDatasetRegistry();

  const train=registry.ingest({
    caseSnapshot:closedCase("train-export"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"family-train-export",
    sourceRefs:["src:train-export"],
    probeOutcomes:outcomes
  });
  adjudicate(train);
  train.approve({operatorApproved:true,approvalReceipt:"operator:train"});

  const evaluation=registry.ingest({
    caseSnapshot:closedCase("eval-export"),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"family-eval-export",
    sourceRefs:["src:eval-export"],
    probeOutcomes:outcomes
  });
  adjudicate(evaluation);
  evaluation.approve({operatorApproved:true,approvalReceipt:"operator:eval"});

  const trainDataset=registry.exportTrainingDataset();
  const evalDataset=registry.exportEvaluationQuarantine();

  assert.equal(trainDataset.cases.length,1);
  assert.equal(trainDataset.cases[0].split,"TRAIN");
  assert.equal(trainDataset.cases[0].neverTrain,false);
  assert.equal(evalDataset.cases.length,1);
  assert.equal(evalDataset.cases[0].split,"EVAL_QUARANTINE");
  assert.equal(evalDataset.cases[0].neverTrain,true);
  assert.equal(evalDataset.labelSemantics,"ADJUDICATED_REFERENCE");
});

test("evaluation quarantine is rejected by empirical fitter",()=>{
  const registry=new RealCaseDatasetRegistry();
  const evaluation=registry.ingest({
    caseSnapshot:closedCase("eval-fit"),
    conditionId:"SC-007",
    datasetUse:"EVAL_QUARANTINE",
    lineageKey:"family-eval-fit",
    sourceRefs:["src:eval-fit"],
    probeOutcomes:outcomes
  });
  adjudicate(evaluation);
  evaluation.approve({operatorApproved:true,approvalReceipt:"operator:eval-fit"});

  assert.throws(
    ()=>fitEmpiricalDifferentialModel(registry.exportEvaluationQuarantine()),
    /Evaluation quarantine/
  );
});

test("neverTrain flag blocks fitting even if split is maliciously changed to TRAIN",()=>{
  const dataset={
    version:"malicious-test",
    kind:"REAL_CASE_TRAINING_CANDIDATES",
    fingerprint:"test",
    cases:[{
      split:"TRAIN",
      neverTrain:true
    }]
  };
  assert.throws(()=>fitEmpiricalDifferentialModel(dataset),/neverTrain/);
});

test("registry export and restore preserve deterministic state",()=>{
  const registry=new RealCaseDatasetRegistry();
  const candidate=registry.ingest({
    caseSnapshot:closedCase("restore"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"family-restore",
    sourceRefs:["src:restore"],
    probeOutcomes:outcomes
  });
  adjudicate(candidate);
  candidate.approve({operatorApproved:true,approvalReceipt:"operator:restore"});

  const exported=registry.export();
  const restored=RealCaseDatasetRegistry.fromSnapshot(exported);

  assert.deepEqual(restored.export(),exported);
  assert.deepEqual(restored.exportTrainingDataset(),registry.exportTrainingDataset());
});

test("research dataset does not copy raw agent identity",()=>{
  const registry=new RealCaseDatasetRegistry();
  const candidate=registry.ingest({
    caseSnapshot:closedCase("privacy","raw-agent-name"),
    conditionId:"SC-007",
    datasetUse:"TRAIN_CANDIDATE",
    lineageKey:"family-privacy",
    sourceRefs:["src:privacy"],
    probeOutcomes:outcomes
  });
  adjudicate(candidate);
  candidate.approve({operatorApproved:true,approvalReceipt:"operator:privacy"});

  const serialized=JSON.stringify(registry.exportTrainingDataset());
  assert.equal(serialized.includes("raw-agent-name"),false);
  assert.ok(serialized.includes("agentFingerprint"));
});
