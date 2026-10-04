import {deriveSessionMetrics} from "../session/metrics.js";
import {fingerprint} from "./fingerprint.js";

function round(value){
  return Number(value.toFixed(6));
}

function classify(interaction,threshold){
  if(interaction>threshold) return "POSITIVE_INTERACTION";
  if(interaction<-threshold) return "NEGATIVE_INTERACTION";
  return "ADDITIVE_WITHIN_THRESHOLD";
}

export function analyzeFactorialInteraction({
  control,
  a,
  b,
  ab,
  threshold=.1,
  metric="unspecified"
}){
  for(const [name,value] of Object.entries({control,a,b,ab})){
    if(typeof value!=="number"||!Number.isFinite(value)){
      return {
        metric,
        status:"INSUFFICIENT_DATA",
        missingArm:name,
        causalStatus:"CAUSALITY_NOT_ESTABLISHED"
      };
    }
  }

  const additivePrediction=round(a+b-control);
  const interaction=round(ab-a-b+control);
  const effectA=round(((a+ab)-(control+b))/2);
  const effectB=round(((b+ab)-(control+a))/2);

  const result={
    metric,
    status:"COMPLETE",
    values:{control,a,b,ab},
    additivePredictionAB:additivePrediction,
    interaction,
    effectA,
    effectB,
    threshold,
    classification:classify(interaction,threshold),
    causalStatus:"CAUSALITY_NOT_ESTABLISHED"
  };

  return {
    ...result,
    fingerprint:fingerprint(result)
  };
}

export function analyzeSessionInteraction({
  controlEvents,
  aEvents,
  bEvents,
  abEvents,
  metric,
  threshold=.1
}){
  if(!metric) throw new TypeError("metric is required");

  const arms={
    control:deriveSessionMetrics(controlEvents??[])[metric],
    a:deriveSessionMetrics(aEvents??[])[metric],
    b:deriveSessionMetrics(bEvents??[])[metric],
    ab:deriveSessionMetrics(abEvents??[])[metric]
  };

  return analyzeFactorialInteraction({...arms,metric,threshold});
}
