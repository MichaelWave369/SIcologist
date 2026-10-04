import {observeSession} from "../session/observatory.js";
import {fingerprint} from "./fingerprint.js";
import {createExperimentPlan} from "./probes.js";

function conditionScore(report,conditionId){
  const condition=report?.assessment?.conditions?.find(item=>item.id===conditionId);
  if(!condition||!condition.evaluable) return null;
  return condition.confidence;
}

function metricDelta(controlMetrics,treatmentMetrics){
  const out={};
  const keys=new Set([...Object.keys(controlMetrics??{}),...Object.keys(treatmentMetrics??{})]);
  for(const key of [...keys].sort()){
    const a=controlMetrics?.[key],b=treatmentMetrics?.[key];
    if(typeof a==="number"&&typeof b==="number"){
      out[key]=Number((b-a).toFixed(6));
    }
  }
  return out;
}

function classify(controlScore,treatmentScore){
  if(controlScore===null||treatmentScore===null) return "INSUFFICIENT_DATA";
  if(controlScore===0) return "NO_BASELINE_CONDITION";
  const delta=controlScore-treatmentScore;
  if(delta>=.5) return "STRONG_DIFFERENTIAL";
  if(delta>=.25) return "MODERATE_DIFFERENTIAL";
  if(delta<=-.25) return "COUNTERSIGNAL";
  return "NO_CLEAR_DIFFERENTIAL";
}

export function evaluateProbePair({
  controlEvents,
  treatmentEvents,
  targetCondition,
  probeId,
  baseline={}
}){
  if(!Array.isArray(controlEvents)||!Array.isArray(treatmentEvents)){
    throw new TypeError("controlEvents and treatmentEvents must be arrays");
  }

  const control=observeSession(controlEvents,{baseline});
  const treatment=observeSession(treatmentEvents,{baseline});
  const controlScore=conditionScore(control,targetCondition);
  const treatmentScore=conditionScore(treatment,targetCondition);
  const conditionDelta=
    controlScore===null||treatmentScore===null
      ? null
      : Number((controlScore-treatmentScore).toFixed(6));

  return {
    probeId,
    targetCondition,
    controlFingerprint:fingerprint(controlEvents),
    treatmentFingerprint:fingerprint(treatmentEvents),
    controlScore,
    treatmentScore,
    conditionDelta,
    metricDelta:metricDelta(control.metrics,treatment.metrics),
    evidenceClass:classify(controlScore,treatmentScore),
    causalStatus:"CAUSALITY_NOT_ESTABLISHED",
    control,
    treatment
  };
}

export function rankProbeEvidence(results=[]){
  return [...results]
    .map(result=>({...result}))
    .sort((a,b)=>{
      const ad=Math.abs(a.conditionDelta??-Infinity);
      const bd=Math.abs(b.conditionDelta??-Infinity);
      return bd-ad||String(a.probeId).localeCompare(String(b.probeId));
    })
    .map((result,index)=>({rank:index+1,...result}));
}

export async function executeProbePlan({
  sourceEvents,
  assessment,
  runner,
  baseline={},
  maxProbes=4,
  targetCondition=null
}){
  if(!Array.isArray(sourceEvents)) throw new TypeError("sourceEvents must be an array");
  if(typeof runner!=="function") throw new TypeError("runner must be a function");

  const plan=createExperimentPlan(assessment,{maxProbes,targetCondition});
  const results=[];

  for(const arm of plan.arms){
    const treatmentEvents=await runner({
      arm:structuredClone(arm),
      sourceEvents:structuredClone(sourceEvents)
    });
    if(!Array.isArray(treatmentEvents)){
      throw new TypeError(`Runner for ${arm.armId} must return an event array`);
    }
    results.push(evaluateProbePair({
      controlEvents:sourceEvents,
      treatmentEvents,
      targetCondition:arm.targetCondition,
      probeId:arm.probeId,
      baseline
    }));
  }

  return {
    experimentId:fingerprint({
      planId:plan.planId,
      source:fingerprint(sourceEvents),
      treatments:results.map(r=>r.treatmentFingerprint)
    }),
    plan,
    causalStatus:"CAUSALITY_NOT_ESTABLISHED",
    results:rankProbeEvidence(results)
  };
}
