import {getDifferentialSpec} from "../differential/catalog.js";

export const DATASET_USES=Object.freeze([
  "TRAIN_CANDIDATE",
  "EVAL_QUARANTINE"
]);

export const CANDIDATE_STATUSES=Object.freeze([
  "AWAITING_ADJUDICATION",
  "ADJUDICATED",
  "DISPUTED",
  "APPROVED",
  "REJECTED"
]);

export function validateDatasetUse(value){
  if(!DATASET_USES.includes(value)){
    throw new TypeError("Unsupported dataset use: "+value);
  }
  return value;
}

export function validateHypothesis(conditionId,hypothesisId){
  const spec=getDifferentialSpec(conditionId);
  if(!spec) throw new TypeError("Unknown conditionId: "+conditionId);
  if(!spec.hypotheses.some(item=>item.id===hypothesisId)){
    throw new TypeError("Hypothesis "+hypothesisId+" is not declared for "+conditionId);
  }
  return hypothesisId;
}

export function declaredProbeIds(conditionId){
  const spec=getDifferentialSpec(conditionId);
  if(!spec) throw new TypeError("Unknown conditionId: "+conditionId);
  return spec.probes.map(item=>item.probeId);
}
