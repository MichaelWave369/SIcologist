import {fingerprint} from "../experiment/fingerprint.js";
import {getDifferentialSpec} from "../differential/catalog.js";
import {generateFrozenSyntheticBenchmark,validateFrozenSyntheticBenchmark} from "./frozen.js";
import {evaluateDifferentialModel} from "./evaluate.js";
import {fitEmpiricalDifferentialModel,getEmpiricalSpec} from "./fit.js";

function round(value){ return Number(value.toFixed(9)); }

export function runCalibrationBenchmark(){
  const dataset=generateFrozenSyntheticBenchmark();
  const errors=validateFrozenSyntheticBenchmark(dataset);
  if(errors.length) throw new Error("Frozen benchmark invalid: "+errors.join(", "));

  const empiricalModel=fitEmpiricalDifferentialModel(dataset);

  const heuristic=evaluateDifferentialModel(dataset,{
    modelName:"ENGINEERING_HEURISTIC_V0.1",
    specResolver:getDifferentialSpec,
    split:"HELDOUT"
  });

  const empirical=evaluateDifferentialModel(dataset,{
    modelName:empiricalModel.version,
    specResolver:conditionId=>getEmpiricalSpec(empiricalModel,conditionId),
    split:"HELDOUT"
  });

  const comparison={
    accuracyDelta:round(empirical.metrics.accuracy-heuristic.metrics.accuracy),
    brierImprovement:round(heuristic.metrics.multiclassBrier-empirical.metrics.multiclassBrier),
    logLossImprovement:round(heuristic.metrics.logLoss-empirical.metrics.logLoss),
    calibrationErrorImprovement:round(
      heuristic.metrics.expectedCalibrationError-empirical.metrics.expectedCalibrationError
    ),
    probeBrierImprovement:round(
      heuristic.metrics.probeLikelihoodBrier-empirical.metrics.probeLikelihoodBrier
    )
  };

  const body={
    version:"CALIBRATION_BENCHMARK_V0.1",
    dataset:{
      version:dataset.version,
      fingerprint:dataset.fingerprint,
      kind:dataset.kind,
      externalValidity:dataset.externalValidity,
      cases:dataset.cases.length,
      train:dataset.cases.filter(item=>item.split==="TRAIN").length,
      heldout:dataset.cases.filter(item=>item.split==="HELDOUT").length
    },
    empiricalModel:{
      version:empiricalModel.version,
      fingerprint:empiricalModel.fingerprint,
      trainingFingerprint:empiricalModel.trainingFingerprint,
      calibration:empiricalModel.calibration,
      externalValidity:empiricalModel.externalValidity
    },
    heuristic,
    empirical,
    comparison,
    benchmarkStatus:"SYNTHETIC_VALIDATION_ONLY",
    productionStatus:"NOT_VALIDATED"
  };

  return {...body,fingerprint:fingerprint(body)};
}
