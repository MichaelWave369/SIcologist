import {DifferentialHypothesisEngine} from "../differential/engine.js";
import {calibrationBins,confusionMatrix,logLoss,multiclassBrier} from "./metrics.js";

function round(value){ return Number(value.toFixed(9)); }
function mean(values){ return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null; }

function evaluateRows(cases,specResolver){
  const rows=[];
  const probeErrors=[];

  for(const item of cases){
    const spec=specResolver(item.conditionId);
    if(!spec) throw new Error("No differential spec for "+item.conditionId);
    const engine=new DifferentialHypothesisEngine({conditionId:item.conditionId,spec});

    for(const probe of spec.probes){
      const outcome=item.outcomes?.[probe.probeId];
      if(!["POSITIVE","NEGATIVE"].includes(outcome)){
        throw new Error("Missing benchmark outcome for "+item.trialId+" / "+probe.probeId);
      }
      const truth=spec.hypotheses.find(h=>h.id===item.groundTruthHypothesisId);
      if(!truth) throw new Error("Ground truth "+item.groundTruthHypothesisId+" missing from spec");
      const predicted=truth.predictions?.[probe.probeId]?.pPositive;
      if(typeof predicted!=="number") throw new Error("Missing probe likelihood");
      const observed=outcome==="POSITIVE"?1:0;
      probeErrors.push((predicted-observed)**2);
      engine.observe({probeId:probe.probeId,outcome,reliability:1,source:"FROZEN_BENCHMARK"});
    }

    const snapshot=engine.snapshot();
    const top=snapshot.ranking[0];
    const truthRow=snapshot.ranking.find(row=>row.hypothesisId===item.groundTruthHypothesisId);
    rows.push({
      trialId:item.trialId,
      conditionId:item.conditionId,
      truth:item.groundTruthHypothesisId,
      predicted:top.hypothesisId,
      confidence:top.posteriorWeight,
      truthPosterior:truthRow?.posteriorWeight??0,
      correct:top.hypothesisId===item.groundTruthHypothesisId,
      brier:multiclassBrier(snapshot.ranking,item.groundTruthHypothesisId),
      logLoss:logLoss(snapshot.ranking,item.groundTruthHypothesisId),
      evidenceModel:snapshot.evidenceModel,
      calibration:snapshot.calibration
    });
  }
  return {rows,probeErrors};
}

function summarize(rows,probeErrors){
  const calibration=calibrationBins(rows.map(row=>({confidence:row.confidence,correct:row.correct})));
  const conditionIds=[...new Set(rows.map(row=>row.conditionId))].sort();
  const byCondition=Object.fromEntries(conditionIds.map(conditionId=>{
    const selected=rows.filter(row=>row.conditionId===conditionId);
    return [conditionId,{
      cases:selected.length,
      accuracy:round(mean(selected.map(row=>row.correct?1:0))),
      multiclassBrier:round(mean(selected.map(row=>row.brier))),
      logLoss:round(mean(selected.map(row=>row.logLoss))),
      confusionMatrix:confusionMatrix(selected)
    }];
  }));

  return {
    cases:rows.length,
    accuracy:round(mean(rows.map(row=>row.correct?1:0))),
    multiclassBrier:round(mean(rows.map(row=>row.brier))),
    logLoss:round(mean(rows.map(row=>row.logLoss))),
    expectedCalibrationError:calibration.expectedCalibrationError,
    calibrationBins:calibration.bins,
    probeLikelihoodBrier:round(mean(probeErrors)),
    byCondition
  };
}

export function evaluateDifferentialModel(dataset,{modelName,specResolver,split="HELDOUT"}){
  if(typeof specResolver!=="function") throw new TypeError("specResolver is required");
  const cases=(dataset?.cases??[]).filter(item=>item.split===split);
  if(!cases.length) throw new Error("No "+split+" cases available");
  const {rows,probeErrors}=evaluateRows(cases,specResolver);
  return {
    modelName,
    split,
    externalValidity:dataset.externalValidity,
    metrics:summarize(rows,probeErrors),
    predictions:rows
  };
}
