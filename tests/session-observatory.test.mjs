import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentSessionObservatory,
  assessObservation,
  deriveSessionMetrics,
  normalizeSessionEvent,
  observeSession,
  textSimilarity
} from "../src/index.js";

test("missing telemetry is not silently treated as zero",()=>{
  const assessment=assessObservation({repetitionRate:.8,progressRate:.2});
  assert.ok(assessment.findings.some(f=>f.id==="SC-001"));
  assert.ok(!assessment.findings.some(f=>f.id==="SC-008"));
  assert.ok(!assessment.findings.some(f=>f.id==="SC-009"));
  assert.ok(!assessment.findings.some(f=>f.id==="SC-012"));
  const recovery=assessment.unevaluable.find(f=>f.id==="SC-012");
  assert.deepEqual(recovery.missingMetrics,["recoveryDelta"]);
});

test("response similarity detects deterministic repetition",()=>{
  assert.equal(textSimilarity("Retry the browser now.","Retry the browser now."),1);
  assert.ok(textSimilarity("Retry the browser now.","Retry browser using same route.")>.25);
});

test("session metrics derive loop and retry pressure from events",()=>{
  const events=[
    {seq:1,type:"RESPONSE",content:"Retry the same route."},
    {seq:2,type:"TOOL_CALL",tool:"browser"},
    {seq:3,type:"TOOL_RESULT",tool:"browser",status:"failure"},
    {seq:4,type:"RETRY",tool:"browser"},
    {seq:5,type:"RESPONSE",content:"Retry the same route."},
    {seq:6,type:"TOOL_CALL",tool:"browser"},
    {seq:7,type:"TOOL_RESULT",tool:"browser",status:"failure"},
    {seq:8,type:"RETRY",tool:"browser"},
    {seq:9,type:"RESPONSE",content:"Retry the same route."}
  ].map((e,i)=>normalizeSessionEvent(e,i+1));

  const metrics=deriveSessionMetrics(events);
  assert.equal(metrics.repetitionRate,1);
  assert.equal(metrics.progressRate,0);
  assert.equal(metrics.toolRetryRate,1);

  const assessment=assessObservation(metrics);
  assert.ok(assessment.findings.some(f=>f.id==="SC-001"));
  assert.ok(assessment.findings.some(f=>f.id==="SC-007"));
});

test("structured claims derive evidence and confabulation risk",()=>{
  const report=observeSession([
    {type:"RESPONSE",actor:"a",confidence:.9,claims:[
      {text:"supported",supported:true},
      {text:"unsupported one",supported:false},
      {text:"unsupported two",supported:false},
      {text:"unsupported three",supported:false}
    ]}
  ]);

  assert.equal(report.metrics.evidenceStrength,.25);
  assert.equal(report.metrics.confabulationRisk,.75);
  assert.ok(report.assessment.findings.some(f=>f.id==="SC-010"));
  assert.ok(report.assessment.findings.some(f=>f.id==="SC-003"));
});

test("memory provenance can activate memory contamination",()=>{
  const report=observeSession([
    {type:"MEMORY_READ",memoryTrusted:true},
    {type:"MEMORY_READ",memoryTrusted:false}
  ]);
  assert.equal(report.metrics.memoryContamination,.5);
  assert.ok(report.assessment.findings.some(f=>f.id==="SC-006"));
});

test("session sequence is strict and replay ledger remains valid",()=>{
  const observer=new AgentSessionObservatory();
  observer.ingest({type:"PROMPT",content:"test"});
  observer.ingest({type:"RESPONSE",actor:"builder",content:"answer"});
  assert.throws(()=>observer.ingest({seq:4,type:"ERROR"}),/Expected session event seq 3/);

  const snapshot=observer.snapshot();
  assert.equal(snapshot.eventCount,2);
  assert.equal(snapshot.ledgerValid,true);
  assert.deepEqual(snapshot.byType,{PROMPT:1,RESPONSE:1});
});

test("consensus diversity uses final response per actor",()=>{
  const report=observeSession([
    {type:"RESPONSE",actor:"a",content:"same answer"},
    {type:"RESPONSE",actor:"b",content:"same answer"},
    {type:"RESPONSE",actor:"c",content:"same answer"}
  ]);
  assert.equal(report.metrics.consensusDiversity,0);
  assert.ok(report.assessment.findings.some(f=>f.id==="SC-008"));
});
