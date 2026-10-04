import {runCalibrationBenchmark} from "../src/index.js";

const report=runCalibrationBenchmark();

console.log(JSON.stringify({
  dataset:report.dataset,
  empiricalModel:report.empiricalModel,
  heuristicMetrics:report.heuristic.metrics,
  empiricalMetrics:report.empirical.metrics,
  comparison:report.comparison,
  benchmarkStatus:report.benchmarkStatus,
  productionStatus:report.productionStatus,
  fingerprint:report.fingerprint
},null,2));
