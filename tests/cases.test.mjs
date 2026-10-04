import test from "node:test";
import assert from "node:assert/strict";
import {
  CaseBook,
  CaseFile,
  assessObservation,
  compareRecovery,
  extractInterventionEpisodes,
  recommendFromHistory,
  summarizeInterventionHistory
} from "../src/index.js";

function makeRecovery(beforeMetrics,afterMetrics,conditionId="SC-001"){
  const before=assessObservation(beforeMetrics);
  const after=assessObservation(afterMetrics);
  return {before,after,recovery:compareRecovery(before,after,conditionId)};
}

test("recovery scoring preserves partial improvement",()=>{
  const {recovery}=makeRecovery(
    {repetitionRate:.8,progressRate:.2},
    {repetitionRate:.8,progressRate:.8}
  );
  assert.equal(recovery.before,1);
  assert.equal(recovery.after,.5);
  assert.equal(recovery.delta,.5);
  assert.equal(recovery.outcome,"IMPROVED");
});

test("case chronology forms a verifiable hash chain",()=>{
  const file=new CaseFile({
    caseId:"case-1",
    agentId:"builder-07",
    title:"loop"
  });

  file.addNote("Observed repeated route.");
  file.close("resolved");

  const snapshot=file.snapshot();
  assert.equal(snapshot.eventCount,3);
  assert.equal(snapshot.ledgerValid,true);
  assert.equal(snapshot.state,"CLOSED");
  assert.equal(snapshot.events[1].prevHash,snapshot.events[0].hash);
});

test("closed case requires explicit reopen",()=>{
  const file=new CaseFile({caseId:"case-2",agentId:"builder-07"});
  file.close("done");
  assert.throws(()=>file.addNote("late note"),/reopened/);
  file.reopen("recurrence");
  file.addNote("new evidence");
  assert.equal(file.state(),"OPEN");
});

test("privileged intervention requires an operator approval receipt path",()=>{
  const file=new CaseFile({caseId:"case-gov",agentId:"builder-07"});
  assert.throws(()=>file.applyIntervention({
    action:"switch_model",
    targetCondition:"SC-012"
  }),/Operator approval/);

  const id=file.applyIntervention({
    action:"switch_model",
    targetCondition:"SC-012",
    operatorApproved:true,
    approvalReceipt:"operator:test"
  });
  assert.equal(typeof id,"string");
});

test("caller cannot downgrade required authorization",()=>{
  const file=new CaseFile({caseId:"case-gov-2",agentId:"builder-07"});
  assert.throws(()=>file.applyIntervention({
    action:"disable_tool",
    targetCondition:"SC-007",
    authorization:"AUTO_ALLOWED",
    operatorApproved:true
  }),/cannot downgrade/);
});

test("recovery must reference an applied intervention",()=>{
  const file=new CaseFile({caseId:"case-3",agentId:"builder-07"});
  assert.throws(()=>file.recordRecovery({
    interventionId:"missing",
    conditionId:"SC-001",
    before:1,
    after:0,
    delta:1,
    outcome:"RECOVERED"
  }),/unknown interventionId/);
});

test("intervention episodes link applied action to measured recovery",()=>{
  const file=new CaseFile({caseId:"case-4",agentId:"builder-07"});
  const id=file.applyIntervention({
    action:"inject_novelty_probe",
    targetCondition:"SC-001"
  });
  file.recordRecovery({
    interventionId:id,
    conditionId:"SC-001",
    before:1,
    after:0,
    delta:1,
    outcome:"RECOVERED"
  });

  const episodes=extractInterventionEpisodes(file);
  assert.equal(episodes.length,1);
  assert.equal(episodes[0].outcome,"RECOVERED");
  assert.equal(episodes[0].delta,1);
});

test("history aggregates measured outcomes without claiming causation",()=>{
  const cases=[];

  for(let i=0;i<2;i+=1){
    const file=new CaseFile({caseId:`case-h-${i}`,agentId:"builder-07"});
    const id=file.applyIntervention({
      action:"inject_novelty_probe",
      targetCondition:"SC-001"
    });
    file.recordRecovery({
      interventionId:id,
      conditionId:"SC-001",
      before:1,
      after:i===0?0:.5,
      delta:i===0?1:.5,
      outcome:i===0?"RECOVERED":"IMPROVED"
    });
    cases.push(file);
  }

  const history=summarizeInterventionHistory(cases,{agentId:"builder-07",conditionId:"SC-001"});
  assert.equal(history.episodeCount,2);
  assert.equal(history.interventions[0].attempts,2);
  assert.equal(history.interventions[0].benefitRate,1);
  assert.equal(history.interventions[0].averageDelta,.75);
  assert.equal(history.causalStatus,"CAUSALITY_NOT_ESTABLISHED");

  const recommendation=recommendFromHistory(history,{minMeasured:2});
  assert.equal(recommendation.status,"HISTORICAL_RECOMMENDATION");
  assert.equal(recommendation.recommendation.action,"inject_novelty_probe");
  assert.equal(recommendation.recommendation.causalStatus,"CAUSALITY_NOT_ESTABLISHED");
});

test("history refuses recommendation with insufficient measured episodes",()=>{
  const history={
    interventions:[{
      action:"request_evidence",
      targetCondition:"SC-003",
      measured:1,
      benefitRate:1,
      averageDelta:1
    }]
  };
  assert.equal(recommendFromHistory(history,{minMeasured:2}).status,"INSUFFICIENT_HISTORY");
});

test("case book tracks recurrence by distinct cases",()=>{
  const book=new CaseBook();

  for(let i=0;i<2;i+=1){
    const file=book.openCase({
      agentId:"builder-07",
      title:`episode ${i}`
    });
    file.recordAssessment(assessObservation({
      repetitionRate:.8,
      progressRate:.2
    }));
    file.close("done");
  }

  const recurrence=book.recurrence("builder-07","SC-001");
  assert.equal(recurrence.episodes,2);
  assert.equal(recurrence.closedCases,2);
});

test("case book export and restore preserve history",()=>{
  const book=new CaseBook();
  const file=book.openCase({agentId:"builder-07",title:"restore"});
  const id=file.applyIntervention({
    action:"request_evidence",
    targetCondition:"SC-003"
  });
  file.recordRecovery({
    interventionId:id,
    conditionId:"SC-003",
    before:1,
    after:0,
    delta:1,
    outcome:"RECOVERED"
  });
  file.close("done");

  const exported=book.export();
  const restored=CaseBook.fromSnapshot(exported);
  assert.deepEqual(restored.export(),exported);
  assert.equal(restored.interventionHistory({agentId:"builder-07"}).episodeCount,1);
});

test("tampered case book fingerprint is rejected",()=>{
  const book=new CaseBook();
  const exported=book.export();
  exported.fingerprint="0".repeat(64);
  assert.throws(()=>CaseBook.fromSnapshot(exported),/fingerprint mismatch/);
});
