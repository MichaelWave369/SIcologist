import {CONDITION_CATALOG} from "../conditions.js";
import {fingerprint} from "../experiment/fingerprint.js";
import {PROBE_POSITIVE_CRITERIA} from "../differential/catalog.js";

export const EMPIRICAL_MODEL_VERSION="EMPIRICAL_MODEL_V0.1";
export const EMPIRICAL_CALIBRATION="SYNTHETIC_BENCHMARKED";

function hypothesisId(conditionId,index){
  return "H-"+conditionId+"-"+String(index+1).padStart(2,"0");
}

function rounded(value){ return Number(value.toFixed(9)); }

export function fitEmpiricalDifferentialModel(dataset,{alpha=1,beta=1,priorAlpha=1}={}){
  if(dataset?.kind==="REAL_CASE_EVAL_QUARANTINE"){
    throw new Error("Evaluation quarantine cannot be used to fit a model");
  }
  const forbidden=(dataset?.cases??[]).filter(item=>item.split==="TRAIN"&&item.neverTrain===true);
  if(forbidden.length){
    throw new Error("neverTrain cases cannot be used for model fitting");
  }

  for(const [name,value] of Object.entries({alpha,beta,priorAlpha})){
    if(typeof value!=="number"||!Number.isFinite(value)||value<=0){
      throw new TypeError(name+" must be a finite number > 0");
    }
  }

  const train=(dataset?.cases??[]).filter(item=>item.split==="TRAIN");
  if(!train.length) throw new Error("No TRAIN cases available");
  const trainingBody={datasetVersion:dataset.version,split:"TRAIN",cases:train};
  const specs={};

  for(const condition of CONDITION_CATALOG){
    const cases=train.filter(item=>item.conditionId===condition.id);
    const classCounts=new Map();
    for(const item of cases){
      classCounts.set(item.groundTruthHypothesisId,(classCounts.get(item.groundTruthHypothesisId)??0)+1);
    }
    const k=condition.alternatives.length;
    const total=cases.length;

    const hypotheses=condition.alternatives.map((label,index)=>{
      const id=hypothesisId(condition.id,index);
      const classCount=classCounts.get(id)??0;
      const priorWeight=(classCount+priorAlpha)/(total+priorAlpha*k);
      const predictions={};

      for(const probeId of condition.probes){
        const matching=cases.filter(item=>item.groundTruthHypothesisId===id);
        const positives=matching.filter(item=>item.outcomes?.[probeId]==="POSITIVE").length;
        const observed=matching.filter(item=>["POSITIVE","NEGATIVE"].includes(item.outcomes?.[probeId])).length;
        if(!observed) throw new Error("No training observations for "+id+" / "+probeId);
        predictions[probeId]={
          pPositive:rounded((positives+alpha)/(observed+alpha+beta)),
          observed,
          positives,
          negatives:observed-positives
        };
      }

      return {id,label,priorWeight:rounded(priorWeight),predictions};
    });

    specs[condition.id]={
      version:EMPIRICAL_MODEL_VERSION,
      calibration:EMPIRICAL_CALIBRATION,
      externalValidity:"NOT_ESTABLISHED",
      priorSource:"TRAIN_CLASS_FREQUENCY_SMOOTHED",
      conditionId:condition.id,
      conditionKey:condition.key,
      datasetVersion:dataset.version,
      datasetFingerprint:dataset.fingerprint,
      probes:condition.probes.map(probeId=>({
        probeId,
        positiveCriterion:PROBE_POSITIVE_CRITERIA[probeId]??null
      })),
      hypotheses
    };
  }

  const body={
    version:EMPIRICAL_MODEL_VERSION,
    calibration:EMPIRICAL_CALIBRATION,
    externalValidity:"NOT_ESTABLISHED",
    datasetVersion:dataset.version,
    datasetFingerprint:dataset.fingerprint,
    trainingFingerprint:fingerprint(trainingBody),
    trainingCaseCount:train.length,
    smoothing:{alpha,beta,priorAlpha},
    specs
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function getEmpiricalSpec(model,conditionId){
  const spec=model?.specs?.[conditionId];
  return spec?structuredClone(spec):null;
}
