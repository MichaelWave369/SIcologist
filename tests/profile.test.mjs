import test from "node:test";
import assert from "node:assert/strict";
import {
  LongitudinalProfile,
  LongitudinalProfileBook,
  compareMetricsToProfile,
  profileScopes,
  summarizeMetricStats,
  updateMetricStats
} from "../src/index.js";

function report(metrics,findings=[]){
  return {
    ledgerValid:true,
    metrics,
    assessment:{findings}
  };
}

const context={
  agentId:"builder-07",
  modelId:"model-a",
  role:"builder",
  taskClass:"code-repair",
  runtime:"local"
};

test("online stats are deterministic and expose sample variance",()=>{
  let stats;
  for(const value of [1,2,3]) stats=updateMetricStats(stats,value);
  const summary=summarizeMetricStats(stats);
  assert.equal(summary.n,3);
  assert.equal(summary.mean,2);
  assert.equal(summary.variance,1);
  assert.equal(summary.stddev,1);
  assert.equal(summary.min,1);
  assert.equal(summary.max,3);
});

test("profile contexts produce exact and fallback scopes",()=>{
  const scopes=profileScopes(context);
  assert.deepEqual(scopes.map(s=>s.scope),[
    "EXACT",
    "TASK_ANY_RUNTIME",
    "ROLE",
    "AGENT_GLOBAL"
  ]);
  assert.equal(new Set(scopes.map(s=>s.key)).size,4);
});

test("baseline admission rejects unqualified untrusted invalid and critical sessions",()=>{
  const profile=new LongitudinalProfile(context);

  assert.equal(profile.admit(report({progressRate:.8}),{
    sampleId:"a",qualification:"RAW",trusted:true
  }).reason,"NOT_QUALIFIED");

  assert.equal(profile.admit(report({progressRate:.8}),{
    sampleId:"b",qualification:"QUALIFIED",trusted:false
  }).reason,"UNTRUSTED_SOURCE");

  assert.equal(profile.admit({...report({progressRate:.8}),ledgerValid:false},{
    sampleId:"c",qualification:"QUALIFIED",trusted:true
  }).reason,"INVALID_LEDGER");

  assert.equal(profile.admit(report({progressRate:.8},[{severity:"critical"}]),{
    sampleId:"d",qualification:"QUALIFIED",trusted:true
  }).reason,"CRITICAL_FINDING_PRESENT");

  assert.equal(profile.snapshot().acceptedSamples,0);
});

test("qualified samples build a mature exact profile and reject duplicates",()=>{
  const book=new LongitudinalProfileBook();

  for(let i=1;i<=5;i+=1){
    const result=book.admit(report({
      repetitionRate:.10+i*.01,
      progressRate:.75+i*.01
    }),context,{
      sampleId:`s-${i}`,
      qualification:"QUALIFIED",
      trusted:true
    });
    assert.equal(result.accepted,true);
  }

  const duplicate=book.admit(report({repetitionRate:.2,progressRate:.8}),context,{
    sampleId:"s-5",
    qualification:"QUALIFIED",
    trusted:true
  });
  assert.equal(duplicate.receipts.every(r=>r.reason==="DUPLICATE_SAMPLE"),true);

  const resolved=book.resolve(context);
  assert.equal(resolved.found,true);
  assert.equal(resolved.selectedScope,"EXACT");
  assert.equal(resolved.profile.maturity,"WARM");
  assert.equal(resolved.profile.acceptedSamples,5);
});

test("profile book falls back to agent global when narrower contexts are cold",()=>{
  const book=new LongitudinalProfileBook();

  for(let i=1;i<=6;i+=1){
    book.admit(report({progressRate:.70+i*.01}),{
      ...context,
      role:`role-${i}`,
      taskClass:`task-${i}`
    },{
      sampleId:`global-${i}`,
      qualification:"QUALIFIED",
      trusted:true
    });
  }

  const resolved=book.resolve(context);
  assert.equal(resolved.found,true);
  assert.equal(resolved.selectedScope,"AGENT_GLOBAL");
  assert.equal(resolved.fallbackUsed,true);
  assert.equal(resolved.profile.acceptedSamples,6);
});

test("self comparison distinguishes stable and extreme deviation",()=>{
  const profile=new LongitudinalProfile(context);
  for(let i=1;i<=6;i+=1){
    profile.admit(report({
      repetitionRate:.10+(i%2)*.01,
      progressRate:.80-(i%2)*.01
    }),{
      sampleId:`p-${i}`,
      qualification:"QUALIFIED",
      trusted:true
    });
  }

  const stable=compareMetricsToProfile({
    repetitionRate:.11,
    progressRate:.79
  },profile.snapshot());
  assert.equal(stable.status,"WITHIN_ESTABLISHED_VARIATION");

  const extreme=compareMetricsToProfile({
    repetitionRate:.60,
    progressRate:.30
  },profile.snapshot());
  assert.equal(extreme.status,"SELF_DEVIATION_DETECTED");
  assert.equal(extreme.notable[0].classification,"EXTREME");
});

test("evaluate uses historical baseline without mutating it",()=>{
  const book=new LongitudinalProfileBook();
  for(let i=1;i<=5;i+=1){
    book.admit(report({confidence:.60+i*.01}),context,{
      sampleId:`history-${i}`,
      qualification:"QUALIFIED",
      trusted:true
    });
  }

  const before=book.resolve(context).profile.acceptedSamples;
  const result=book.evaluate(report({confidence:.95}),context);
  const after=book.resolve(context).profile.acceptedSamples;

  assert.equal(before,5);
  assert.equal(after,5);
  assert.equal(result.status,"PROFILE_COMPARISON_READY");
  assert.equal(result.comparison.status,"SELF_DEVIATION_DETECTED");
});

test("profile book export and restore preserve deterministic state",()=>{
  const book=new LongitudinalProfileBook();
  for(let i=1;i<=5;i+=1){
    book.admit(report({progressRate:.7+i*.01}),context,{
      sampleId:`restore-${i}`,
      qualification:"QUALIFIED",
      trusted:true
    });
  }

  const exported=book.export();
  const restored=LongitudinalProfileBook.fromSnapshot(exported);
  assert.deepEqual(restored.export(),exported);
  assert.deepEqual(restored.resolve(context),book.resolve(context));
});

test("tampered profile snapshot fingerprint is rejected",()=>{
  const book=new LongitudinalProfileBook();
  const exported=book.export();
  exported.fingerprint="0".repeat(64);
  assert.throws(()=>LongitudinalProfileBook.fromSnapshot(exported),/fingerprint mismatch/);
});
