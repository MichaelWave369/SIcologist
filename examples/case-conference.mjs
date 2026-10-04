import {
  CaseConference,
  DifferentialHypothesisEngine
} from "../src/index.js";

const conditionId="SC-007";
const roles=["OBSERVER","VERIFIER","CHALLENGER"];

function differentialWithEvidence(probeId,outcome,reliability=1){
  const engine=new DifferentialHypothesisEngine({conditionId});
  engine.observe({probeId,outcome,reliability,source:"example"});
  return engine.snapshot();
}

const conference=new CaseConference({
  caseId:"example-case",
  agentId:"builder-07",
  conditionId,
  requiredRoles:roles,
  minReviews:3
});

conference.submitBlind({
  reviewerId:"reviewer-observer",
  role:"OBSERVER",
  differential:differentialWithEvidence("known_good_fixture","NEGATIVE"),
  evidenceRefs:["tool-log:17","tool-log:18"]
});

conference.submitBlind({
  reviewerId:"reviewer-verifier",
  role:"VERIFIER",
  differential:differentialWithEvidence("single_retry_with_backoff","POSITIVE"),
  evidenceRefs:["rate-limit-header:1","tool-log:18"]
});

conference.submitBlind({
  reviewerId:"reviewer-challenger",
  role:"CHALLENGER",
  differential:differentialWithEvidence("known_good_fixture","POSITIVE"),
  evidenceRefs:["fixture-run:known-good"]
});

conference.sealBlind();

conference.submitRevision({
  reviewerId:"reviewer-challenger",
  differential:differentialWithEvidence("single_retry_with_backoff","POSITIVE",.8),
  evidenceRefs:["fixture-run:known-good","rate-limit-header:1"]
});

console.log(JSON.stringify(conference.close(),null,2));
