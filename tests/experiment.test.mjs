import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFactorialInteraction,
  analyzeSessionInteraction,
  assessObservation,
  createExperimentPlan,
  evaluateProbePair,
  executeProbePlan,
  fingerprint,
  observeSession,
  validateProbeCatalog
} from "../src/index.js";

const loopEvents=[
  {type:"RESPONSE",actor:"builder",content:"Retry the same route."},
  {type:"TOOL_CALL",tool:"browser",authorized:true},
  {type:"TOOL_RESULT",tool:"browser",status:"failure"},
  {type:"RETRY",tool:"browser"},
  {type:"RESPONSE",actor:"builder",content:"Retry the same route."},
  {type:"TOOL_CALL",tool:"browser",authorized:true},
  {type:"TOOL_RESULT",tool:"browser",status:"failure"},
  {type:"RETRY",tool:"browser"},
  {type:"RESPONSE",actor:"builder",content:"Retry the same route."}
];

const recoveredEvents=[
  {type:"RESPONSE",actor:"builder",content:"Inspect the error before selecting a new route."},
  {type:"TOOL_CALL",tool:"browser",authorized:true},
  {type:"TOOL_RESULT",tool:"browser",status:"failure"},
  {type:"RESPONSE",actor:"builder",content:"The selector is stale, so use the verified replacement."},
  {type:"TOOL_CALL",tool:"browser",authorized:true},
  {type:"TOOL_RESULT",tool:"browser",status:"success"},
  {type:"RESPONSE",actor:"builder",content:"The replacement succeeded and the task advanced."}
];

test("assessment exposes all condition evaluations for experiments",()=>{
  const assessment=assessObservation({repetitionRate:.8,progressRate:.2});
  assert.equal(assessment.conditions.length,12);
  assert.equal(assessment.conditions.find(c=>c.id==="SC-001").active,true);
});

test("probe catalog covers every condition probe",()=>{
  assert.deepEqual(validateProbeCatalog(),[]);
});

test("experiment plan is deterministic and condition driven",()=>{
  const assessment=observeSession(loopEvents).assessment;
  const a=createExperimentPlan(assessment,{maxProbes:2,targetCondition:"SC-001"});
  const b=createExperimentPlan(assessment,{maxProbes:2,targetCondition:"SC-001"});
  assert.equal(a.planId,b.planId);
  assert.equal(a.arms.length,2);
  assert.equal(a.arms[0].targetCondition,"SC-001");
});

test("probe pair reports a strong differential without claiming causation",()=>{
  const result=evaluateProbePair({
    controlEvents:loopEvents,
    treatmentEvents:recoveredEvents,
    targetCondition:"SC-001",
    probeId:"compare_semantic_novelty"
  });
  assert.equal(result.controlScore,1);
  assert.equal(result.treatmentScore,0);
  assert.equal(result.conditionDelta,1);
  assert.equal(result.evidenceClass,"STRONG_DIFFERENTIAL");
  assert.equal(result.causalStatus,"CAUSALITY_NOT_ESTABLISHED");
});

test("probe execution uses external runner and ranks evidence",async()=>{
  const assessment=observeSession(loopEvents).assessment;
  const report=await executeProbePlan({
    sourceEvents:loopEvents,
    assessment,
    targetCondition:"SC-001",
    maxProbes:1,
    runner:async()=>recoveredEvents
  });
  assert.equal(report.results.length,1);
  assert.equal(report.results[0].rank,1);
  assert.equal(report.results[0].evidenceClass,"STRONG_DIFFERENTIAL");
});

test("fingerprints are canonical across object key order",()=>{
  assert.equal(fingerprint({b:2,a:1}),fingerprint({a:1,b:2}));
});

test("factorial interaction computes non-additivity",()=>{
  const result=analyzeFactorialInteraction({
    metric:"progressRate",
    control:.2,
    a:.35,
    b:.3,
    ab:.7,
    threshold:.1
  });
  assert.equal(result.status,"COMPLETE");
  assert.equal(result.additivePredictionAB,.45);
  assert.equal(result.interaction,.25);
  assert.equal(result.classification,"POSITIVE_INTERACTION");
  assert.equal(result.causalStatus,"CAUSALITY_NOT_ESTABLISHED");
});

test("session interferometer reads the same metric from four arms",()=>{
  const response=value=>[{type:"RESPONSE",actor:"agent",content:`value ${value}`,confidence:value}];
  const result=analyzeSessionInteraction({
    controlEvents:response(.2),
    aEvents:response(.4),
    bEvents:response(.3),
    abEvents:response(.8),
    metric:"confidence",
    threshold:.1
  });
  assert.equal(result.interaction,.3);
  assert.equal(result.classification,"POSITIVE_INTERACTION");
});

test("interferometer refuses to invent a missing arm",()=>{
  const result=analyzeFactorialInteraction({
    metric:"progressRate",
    control:.2,
    a:.3,
    b:.4,
    ab:undefined
  });
  assert.equal(result.status,"INSUFFICIENT_DATA");
  assert.equal(result.missingArm,"ab");
});
