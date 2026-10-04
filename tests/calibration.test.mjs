import test from "node:test";
import assert from "node:assert/strict";
import {
  DifferentialHypothesisEngine,
  FROZEN_BENCHMARK_COUNTS,
  FROZEN_BENCHMARK_FINGERPRINT,
  evaluateDifferentialModel,
  fitEmpiricalDifferentialModel,
  generateFrozenSyntheticBenchmark,
  getDifferentialSpec,
  getEmpiricalSpec,
  runCalibrationBenchmark,
  validateFrozenSyntheticBenchmark
} from "../src/index.js";

test("frozen benchmark fingerprint and counts are pinned",()=>{
  const dataset=generateFrozenSyntheticBenchmark();
  assert.deepEqual(validateFrozenSyntheticBenchmark(dataset),[]);
  assert.equal(dataset.fingerprint,FROZEN_BENCHMARK_FINGERPRINT);
  assert.equal(dataset.cases.length,FROZEN_BENCHMARK_COUNTS.cases);
  assert.equal(dataset.cases.filter(item=>item.split==="TRAIN").length,224);
  assert.equal(dataset.cases.filter(item=>item.split==="HELDOUT").length,112);
});

test("frozen benchmark spans every condition and hypothesis",()=>{
  const dataset=generateFrozenSyntheticBenchmark();
  assert.equal(new Set(dataset.cases.map(item=>item.conditionId)).size,12);
  assert.equal(new Set(dataset.cases.map(item=>item.groundTruthHypothesisId)).size,28);
});

test("empirical fitter uses training observations with smoothing",()=>{
  const dataset=generateFrozenSyntheticBenchmark();
  const model=fitEmpiricalDifferentialModel(dataset);
  const spec=getEmpiricalSpec(model,"SC-007");
  assert.equal(model.trainingCaseCount,224);
  assert.equal(model.calibration,"SYNTHETIC_BENCHMARKED");
  assert.equal(model.externalValidity,"NOT_ESTABLISHED");
  assert.equal(spec.hypotheses[0].predictions.known_good_fixture.pPositive,.8);
  assert.equal(spec.hypotheses[1].predictions.single_retry_with_backoff.pPositive,.8);
  assert.equal(spec.hypotheses[2].predictions.known_good_fixture.pPositive,.7);
});

test("heldout outcome changes do not change learned parameters",()=>{
  const dataset=generateFrozenSyntheticBenchmark();
  const original=fitEmpiricalDifferentialModel(dataset);
  const changed=structuredClone(dataset);
  const heldout=changed.cases.find(item=>item.split==="HELDOUT");
  const probeId=Object.keys(heldout.outcomes)[0];
  heldout.outcomes[probeId]=heldout.outcomes[probeId]==="POSITIVE"?"NEGATIVE":"POSITIVE";
  changed.fingerprint="modified-heldout-for-test";

  const refit=fitEmpiricalDifferentialModel(changed);
  assert.equal(refit.trainingFingerprint,original.trainingFingerprint);
  for(const conditionId of Object.keys(original.specs)){
    assert.deepEqual(refit.specs[conditionId].hypotheses,original.specs[conditionId].hypotheses);
  }
  assert.notEqual(refit.datasetFingerprint,original.datasetFingerprint);
});

test("differential engine accepts empirical spec and exposes provenance",()=>{
  const dataset=generateFrozenSyntheticBenchmark();
  const model=fitEmpiricalDifferentialModel(dataset);
  const spec=getEmpiricalSpec(model,"SC-003");
  const snapshot=new DifferentialHypothesisEngine({conditionId:"SC-003",spec}).snapshot();
  assert.equal(snapshot.evidenceModel,"EMPIRICAL_MODEL_V0.1");
  assert.equal(snapshot.calibration,"SYNTHETIC_BENCHMARKED");
  assert.equal(snapshot.externalValidity,"NOT_ESTABLISHED");
});

test("heldout evaluator produces finite proper scoring metrics",()=>{
  const dataset=generateFrozenSyntheticBenchmark();
  const model=fitEmpiricalDifferentialModel(dataset);
  const evaluation=evaluateDifferentialModel(dataset,{
    modelName:model.version,
    specResolver:conditionId=>getEmpiricalSpec(model,conditionId)
  });
  assert.equal(evaluation.metrics.cases,112);
  assert.ok(evaluation.metrics.accuracy>=0&&evaluation.metrics.accuracy<=1);
  assert.ok(evaluation.metrics.multiclassBrier>=0);
  assert.ok(evaluation.metrics.logLoss>=0);
  assert.ok(evaluation.metrics.expectedCalibrationError>=0);
  assert.ok(evaluation.metrics.probeLikelihoodBrier>=0);
  assert.equal(Object.keys(evaluation.metrics.byCondition).length,12);
});

test("benchmark compares heldout performance without promoting production",()=>{
  const report=runCalibrationBenchmark();
  assert.equal(report.dataset.cases,336);
  assert.equal(report.dataset.heldout,112);
  assert.equal(report.benchmarkStatus,"SYNTHETIC_VALIDATION_ONLY");
  assert.equal(report.productionStatus,"NOT_VALIDATED");
  assert.ok(report.empirical.metrics.accuracy>report.heuristic.metrics.accuracy);
  assert.ok(report.empirical.metrics.multiclassBrier<report.heuristic.metrics.multiclassBrier);
  assert.ok(report.empirical.metrics.logLoss<report.heuristic.metrics.logLoss);
  assert.ok(report.comparison.accuracyDelta>0);
  assert.ok(report.comparison.brierImprovement>0);
  assert.ok(report.comparison.logLossImprovement>0);
});

test("heuristic benchmark remains separately reproducible",()=>{
  const dataset=generateFrozenSyntheticBenchmark();
  const evaluation=evaluateDifferentialModel(dataset,{
    modelName:"ENGINEERING_HEURISTIC_V0.1",
    specResolver:getDifferentialSpec
  });
  assert.equal(evaluation.metrics.cases,112);
  assert.equal(evaluation.externalValidity,"NOT_ESTABLISHED");
});
