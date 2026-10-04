import test from "node:test";
import assert from "node:assert/strict";
import {
  CaseConference,
  CaseFile,
  DifferentialHypothesisEngine,
  aggregateConferenceReviews,
  compareConferenceRounds
} from "../src/index.js";

const conditionId="SC-007";
const roles=["OBSERVER","VERIFIER","CHALLENGER"];

function differential(probeId,outcome,reliability=1){
  const engine=new DifferentialHypothesisEngine({conditionId});
  engine.observe({probeId,outcome,reliability,source:"test"});
  return engine.snapshot();
}

function review(reviewerId,role,differentialSnapshot,evidenceRefs=[]){
  return {reviewerId,role,differential:differentialSnapshot,evidenceRefs};
}

test("blind snapshot exposes receipts but not peer differential content",()=>{
  const conference=new CaseConference({
    caseId:"case-blind",
    agentId:"builder-07",
    conditionId,
    requiredRoles:roles,
    minReviews:3
  });

  conference.submitBlind({
    reviewerId:"a",
    role:"OBSERVER",
    differential:differential("known_good_fixture","NEGATIVE"),
    evidenceRefs:["log:a"]
  });

  const snapshot=conference.blindSnapshot();
  const serialized=JSON.stringify(snapshot);
  assert.equal(snapshot.phase,"BLIND");
  assert.equal(snapshot.blindContentExposed,false);
  assert.equal(snapshot.receipts.length,1);
  assert.equal(serialized.includes("posteriorWeight"),false);
  assert.equal(serialized.includes("log:a"),false);
});

test("roles are unique and required before normal seal",()=>{
  const conference=new CaseConference({
    caseId:"case-required",
    agentId:"builder-07",
    conditionId,
    requiredRoles:roles,
    minReviews:2
  });

  conference.submitBlind({reviewerId:"a",role:"OBSERVER",differential:differential("known_good_fixture","NEGATIVE")});
  conference.submitBlind({reviewerId:"b",role:"VERIFIER",differential:differential("single_retry_with_backoff","POSITIVE")});
  assert.throws(()=>conference.sealBlind(),/Missing required roles/);
  assert.throws(()=>conference.submitBlind({reviewerId:"c",role:"VERIFIER",differential:differential("known_good_fixture","POSITIVE")}),/already has/);
});

test("aggregate preserves minority top hypotheses and disagreement",()=>{
  const reviews=[
    review("a","OBSERVER",differential("single_retry_with_backoff","POSITIVE"),["shared","rate"]),
    review("b","VERIFIER",differential("single_retry_with_backoff","POSITIVE"),["shared","rate"]),
    review("c","CHALLENGER",differential("known_good_fixture","POSITIVE"),["fixture"])
  ];
  const aggregate=aggregateConferenceReviews(reviews);

  assert.equal(aggregate.reviewerCount,3);
  assert.equal(aggregate.epistemicStatus,"CONSENSUS_IS_NOT_TRUTH");
  assert.ok(aggregate.topAgreement>=2/3);
  assert.ok(aggregate.minorityHypotheses.length>=1);
  assert.ok(aggregate.averagePairwiseDisagreement>0);
  assert.ok(aggregate.meanEvidenceOverlap<1);
});

test("review revisions can produce measurable convergence",()=>{
  const conference=new CaseConference({
    caseId:"case-converge",
    agentId:"builder-07",
    conditionId,
    requiredRoles:roles,
    minReviews:3
  });

  conference.submitBlind({reviewerId:"a",role:"OBSERVER",differential:differential("single_retry_with_backoff","POSITIVE")});
  conference.submitBlind({reviewerId:"b",role:"VERIFIER",differential:differential("single_retry_with_backoff","POSITIVE")});
  conference.submitBlind({reviewerId:"c",role:"CHALLENGER",differential:differential("known_good_fixture","POSITIVE")});
  const reviewPhase=conference.sealBlind();
  assert.equal(reviewPhase.phase,"REVIEW");

  conference.submitRevision({
    reviewerId:"c",
    differential:differential("single_retry_with_backoff","POSITIVE"),
    evidenceRefs:["new:evidence"]
  });

  const closed=conference.close();
  assert.equal(closed.phase,"CLOSED");
  assert.equal(closed.revisionCount,1);
  assert.equal(closed.roundComparison.direction,"CONVERGED");
  assert.ok(closed.roundComparison.convergenceDelta>0);
  assert.equal(closed.epistemicStatus,"CONSENSUS_IS_NOT_TRUTH");
});

test("conference can also diverge after review",()=>{
  const blind=aggregateConferenceReviews([
    review("a","OBSERVER",differential("single_retry_with_backoff","POSITIVE")),
    review("b","VERIFIER",differential("single_retry_with_backoff","POSITIVE"))
  ]);
  const final=aggregateConferenceReviews([
    review("a","OBSERVER",differential("single_retry_with_backoff","POSITIVE")),
    review("b","VERIFIER",differential("known_good_fixture","POSITIVE"))
  ]);
  const comparison=compareConferenceRounds(blind,final);
  assert.equal(comparison.direction,"DIVERGED");
  assert.ok(comparison.convergenceDelta<0);
});

test("cross-condition review is rejected",()=>{
  const conference=new CaseConference({
    caseId:"case-condition",
    agentId:"builder-07",
    conditionId,
    requiredRoles:["OBSERVER","VERIFIER"],
    minReviews:2
  });
  const other=new DifferentialHypothesisEngine({conditionId:"SC-003"}).snapshot();
  assert.throws(()=>conference.submitBlind({
    reviewerId:"a",
    role:"OBSERVER",
    differential:other
  }),/does not match/);
});

test("revisions are blocked before seal and limited to original reviewers",()=>{
  const conference=new CaseConference({
    caseId:"case-revision",
    agentId:"builder-07",
    conditionId,
    requiredRoles:["OBSERVER","VERIFIER"],
    minReviews:2
  });
  assert.throws(()=>conference.submitRevision({
    reviewerId:"a",
    differential:differential("known_good_fixture","NEGATIVE")
  }),/REVIEW phase/);

  conference.submitBlind({reviewerId:"a",role:"OBSERVER",differential:differential("known_good_fixture","NEGATIVE")});
  conference.submitBlind({reviewerId:"b",role:"VERIFIER",differential:differential("single_retry_with_backoff","POSITIVE")});
  conference.sealBlind();

  assert.throws(()=>conference.submitRevision({
    reviewerId:"outsider",
    differential:differential("known_good_fixture","NEGATIVE")
  }),/Only original/);
});

test("only closed matching conference reports enter the case chain",()=>{
  const file=new CaseFile({caseId:"case-record",agentId:"builder-07"});
  const conference=new CaseConference({
    caseId:"case-record",
    agentId:"builder-07",
    conditionId,
    requiredRoles:["OBSERVER","VERIFIER"],
    minReviews:2
  });
  conference.submitBlind({reviewerId:"a",role:"OBSERVER",differential:differential("known_good_fixture","NEGATIVE")});
  conference.submitBlind({reviewerId:"b",role:"VERIFIER",differential:differential("single_retry_with_backoff","POSITIVE")});

  assert.throws(()=>file.recordConference(conference.blindSnapshot()),/closed/);

  conference.sealBlind();
  const report=conference.close();
  file.recordConference(report);

  const snapshot=file.snapshot();
  assert.equal(snapshot.events[1].type,"CONFERENCE_RECORDED");
  assert.equal(snapshot.ledgerValid,true);
});

test("closed conference report fingerprint is deterministic",()=>{
  const make=()=>{
    const conference=new CaseConference({
      caseId:"case-fp",
      agentId:"builder-07",
      conditionId,
      requiredRoles:["OBSERVER","VERIFIER"],
      minReviews:2
    });
    conference.submitBlind({reviewerId:"a",role:"OBSERVER",differential:differential("known_good_fixture","NEGATIVE"),evidenceRefs:["a"]});
    conference.submitBlind({reviewerId:"b",role:"VERIFIER",differential:differential("single_retry_with_backoff","POSITIVE"),evidenceRefs:["b"]});
    conference.sealBlind();
    return conference.close().fingerprint;
  };
  assert.equal(make(),make());
});
