import test from "node:test";
import assert from "node:assert/strict";
import {
  CaseFile,
  DifferentialHypothesisEngine,
  assessObservation,
  bayesUpdate,
  entropy,
  getDifferentialSpec,
  probeInformationGain,
  validateDifferentialCatalog
} from "../src/index.js";

test("differential catalog covers all declared condition hypotheses and probes",()=>{
  assert.deepEqual(validateDifferentialCatalog(),[]);
  const spec=getDifferentialSpec("SC-007");
  assert.equal(spec.hypotheses.length,3);
  assert.equal(spec.probes.length,2);
  assert.equal(spec.calibration,"UNVALIDATED");
});

test("uniform starting weights are normalized",()=>{
  const engine=new DifferentialHypothesisEngine({conditionId:"SC-007"});
  const snapshot=engine.snapshot();
  const total=snapshot.ranking.reduce((sum,item)=>sum+item.posteriorWeight,0);
  assert.ok(Math.abs(total-1)<1e-8);
  assert.equal(snapshot.evidenceCount,0);
  assert.equal(snapshot.explanationStatus,"NOT_ESTABLISHED");
});

test("information gain ranks a declared probe without mutating hypotheses",()=>{
  const spec=getDifferentialSpec("SC-007");
  const hypotheses=spec.hypotheses.map(h=>({
    ...h,
    weight:h.priorWeight
  }));
  const before=JSON.stringify(hypotheses);
  const info=probeInformationGain(hypotheses,"known_good_fixture");
  assert.ok(info.informationGain>0);
  assert.equal(JSON.stringify(hypotheses),before);
});

test("positive evidence updates weights toward hypotheses that predicted it",()=>{
  const engine=new DifferentialHypothesisEngine({conditionId:"SC-007"});
  engine.observe({
    probeId:"single_retry_with_backoff",
    outcome:"POSITIVE",
    reliability:1,
    source:"test"
  });
  const snapshot=engine.snapshot();
  assert.equal(snapshot.ranking[0].label,"rate limiting");
  assert.ok(snapshot.ranking[0].posteriorWeight>.5);
  assert.equal(snapshot.evidenceCount,1);
});

test("negative evidence moves weight away from a positive predictor",()=>{
  const engine=new DifferentialHypothesisEngine({conditionId:"SC-003"});
  const before=engine.snapshot().ranking.find(item=>item.label==="incomplete evidence telemetry").posteriorWeight;
  engine.observe({
    probeId:"request_citations",
    outcome:"NEGATIVE",
    reliability:1
  });
  const after=engine.snapshot().ranking.find(item=>item.label==="incomplete evidence telemetry").posteriorWeight;
  assert.ok(after<before);
});

test("zero reliability records evidence without changing weights",()=>{
  const engine=new DifferentialHypothesisEngine({conditionId:"SC-003"});
  const before=engine.snapshot().ranking;
  engine.observe({
    probeId:"request_citations",
    outcome:"POSITIVE",
    reliability:0
  });
  const after=engine.snapshot().ranking;
  assert.deepEqual(after,before);
  assert.equal(engine.snapshot().evidenceCount,1);
});

test("inconclusive evidence is preserved but does not update weights",()=>{
  const engine=new DifferentialHypothesisEngine({conditionId:"SC-003"});
  const before=engine.snapshot().ranking;
  engine.observe({
    probeId:"request_citations",
    outcome:"INCONCLUSIVE",
    reliability:1
  });
  assert.deepEqual(engine.snapshot().ranking,before);
});

test("probe recommendation skips previously observed probes",()=>{
  const engine=new DifferentialHypothesisEngine({conditionId:"SC-007"});
  const first=engine.recommendProbe().recommendation.probeId;
  engine.observe({probeId:first,outcome:"INCONCLUSIVE"});
  const second=engine.recommendProbe();
  assert.equal(second.status,"PROBE_RECOMMENDED");
  assert.notEqual(second.recommendation.probeId,first);
});

test("differential can be created directly from an active assessment finding",()=>{
  const assessment=assessObservation({
    toolRetryRate:.9,
    progressRate:.1
  });
  const engine=DifferentialHypothesisEngine.fromAssessment(assessment,"SC-007");
  assert.equal(engine.snapshot().conditionId,"SC-007");
});

test("custom priors remain explicit and normalize",()=>{
  const spec=getDifferentialSpec("SC-003");
  const engine=new DifferentialHypothesisEngine({
    conditionId:"SC-003",
    priors:{
      [spec.hypotheses[0].id]:9,
      [spec.hypotheses[1].id]:1
    },
    priorSource:"CASE_HISTORY_V1"
  });
  const snapshot=engine.snapshot();
  assert.equal(snapshot.priorSource,"CASE_HISTORY_V1");
  assert.equal(snapshot.ranking[0].posteriorWeight,.9);
});

test("case file records differential snapshot in the hash chain",()=>{
  const assessment=assessObservation({
    toolRetryRate:.9,
    progressRate:.1
  });
  const engine=DifferentialHypothesisEngine.fromAssessment(assessment,"SC-007");
  const file=new CaseFile({caseId:"diff-case",agentId:"builder-07"});
  file.recordAssessment(assessment);
  file.recordDifferential(engine.snapshot());
  const snapshot=file.snapshot();
  assert.equal(snapshot.events[2].type,"DIFFERENTIAL_RECORDED");
  assert.equal(snapshot.ledgerValid,true);
});

test("bayes helper keeps normalized weights",()=>{
  const spec=getDifferentialSpec("SC-009");
  const hypotheses=spec.hypotheses.map(h=>({...h,weight:h.priorWeight}));
  const updated=bayesUpdate(hypotheses,{
    probeId:"score_challenge_quality",
    outcome:"POSITIVE",
    reliability:.8
  });
  const total=updated.reduce((sum,item)=>sum+item.weight,0);
  assert.ok(Math.abs(total-1)<1e-12);
  assert.ok(entropy(updated.map(item=>item.weight))>=0);
});
