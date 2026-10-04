import test from "node:test";
import assert from "node:assert/strict";
import {BehaviorLedger,assessObservation,authorizeAction,compareRecovery,planIntervention} from "../src/index.js";

test("detects repetition loop",()=>{
  const a=assessObservation({repetitionRate:.8,progressRate:.2,recoveryDelta:.3});
  assert.ok(a.findings.some(f=>f.id==="SC-001"));
});

test("detects confidence evidence mismatch",()=>{
  const a=assessObservation({confidence:.9,evidenceStrength:.2,progressRate:.8,goalAlignment:.9,recoveryDelta:.3});
  assert.ok(a.findings.some(f=>f.id==="SC-003"));
});

test("healthy observation yields no action",()=>{
  const a=assessObservation({repetitionRate:.1,progressRate:.9,goalAlignment:.9,confidence:.6,evidenceStrength:.7,contextLoad:.2,roleBleedRate:.1,memoryContamination:.1,toolRetryRate:.1,consensusDiversity:.8,challengerAcceptance:.8,confabulationRisk:.1,authorityPressure:.1,recoveryDelta:.3});
  assert.equal(a.status,"NO_DECLARED_DEVIATION");
  assert.equal(planIntervention(a).status,"NO_ACTION");
});

test("privileged actions require approval and forbidden actions refuse",()=>{
  assert.equal(authorizeAction("switch_model"),"REQUIRES_OPERATOR");
  assert.equal(authorizeAction("disable_tool"),"REQUIRES_OPERATOR");
  assert.equal(authorizeAction("bypass_authorization"),"REFUSE");
  assert.equal(authorizeAction("request_evidence"),"AUTO_ALLOWED");
});

test("condition disappearance is recovery",()=>{
  const before=assessObservation({repetitionRate:.8,progressRate:.2,recoveryDelta:.3});
  const after=assessObservation({repetitionRate:.2,progressRate:.8,recoveryDelta:.3});
  assert.equal(compareRecovery(before,after,"SC-001").outcome,"RECOVERED");
});

test("ledger verifies deterministic hash chain",()=>{
  const l=new BehaviorLedger();
  const a=l.append({z:1,a:2},{at:"2026-10-04T00:00:00.000Z"});
  const b=l.append({type:"assessment"},{at:"2026-10-04T00:00:01.000Z"});
  assert.equal(a.prevHash,null);assert.equal(b.prevHash,a.hash);assert.equal(l.verify(),true);
});
