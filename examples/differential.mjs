import {
  DifferentialHypothesisEngine,
  assessObservation
} from "../src/index.js";

const assessment=assessObservation({
  toolRetryRate:.9,
  progressRate:.1
});

const engine=DifferentialHypothesisEngine.fromAssessment(
  assessment,
  "SC-007"
);

console.log("INITIAL");
console.log(JSON.stringify(engine.snapshot(),null,2));

const first=engine.recommendProbe().recommendation;
engine.observe({
  probeId:first.probeId,
  outcome:"NEGATIVE",
  reliability:.9,
  source:"example-adapter",
  detail:"Declared positive criterion was not observed."
});

console.log("\nAFTER EVIDENCE");
console.log(JSON.stringify(engine.snapshot(),null,2));
