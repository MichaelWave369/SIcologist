import {fingerprint} from "../experiment/fingerprint.js";
import {getDifferentialSpec} from "../differential/catalog.js";
import {calibrationBins,confusionMatrix,logLoss,multiclassBrier} from "../calibration/metrics.js";

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }
function mean(values){ return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null; }

function datasetBody(dataset){
  return {
    version:dataset?.version,
    kind:dataset?.kind,
    externalValidity:dataset?.externalValidity,
    labelSemantics:dataset?.labelSemantics,
    cases:dataset?.cases??[]
  };
}

function validateEvaluationDataset(dataset){
  if(dataset?.kind!=="REAL_CASE_EVAL_QUARANTINE"){
    throw new TypeError("Sealed evaluation requires REAL_CASE_EVAL_QUARANTINE");
  }
  if(dataset?.labelSemantics!=="ADJUDICATED_REFERENCE"){
    throw new Error("Evaluation labels must use ADJUDICATED_REFERENCE semantics");
  }
  if(!Array.isArray(dataset?.cases)||!dataset.cases.length){
    throw new Error("Evaluation quarantine is empty");
  }
  if(fingerprint(datasetBody(dataset))!==dataset.fingerprint){
    throw new Error("Evaluation dataset fingerprint mismatch");
  }

  const trialIds=new Set();
  for(const item of dataset.cases){
    if(typeof item.trialId!=="string"||!item.trialId) throw new Error("Every evaluation case needs a trialId");
    if(trialIds.has(item.trialId)) throw new Error("Duplicate evaluation trialId: "+item.trialId);
    trialIds.add(item.trialId);

    if(item.split!=="EVAL_QUARANTINE") throw new Error("Evaluation case escaped quarantine split");
    if(item.neverTrain!==true) throw new Error("Evaluation case must carry neverTrain=true");
    if(item.labelStatus!=="ADJUDICATED_REFERENCE") throw new Error("Evaluation case label is not adjudicated reference");

    const spec=getDifferentialSpec(item.conditionId);
    if(!spec) throw new Error("Unknown evaluation condition: "+item.conditionId);
    if(!spec.hypotheses.some(h=>h.id===item.groundTruthHypothesisId)){
      throw new Error("Reference label is not declared for "+item.conditionId);
    }
    for(const probe of spec.probes){
      if(!["POSITIVE","NEGATIVE"].includes(item.outcomes?.[probe.probeId])){
        throw new Error("Evaluation case missing binary outcome for "+probe.probeId);
      }
    }
  }
}

function publicCases(dataset){
  return dataset.cases
    .map(item=>({
      trialId:item.trialId,
      conditionId:item.conditionId,
      outcomes:clone(item.outcomes)
    }))
    .sort((a,b)=>a.trialId.localeCompare(b.trialId));
}

function referenceLabels(dataset){
  return dataset.cases
    .map(item=>({
      trialId:item.trialId,
      conditionId:item.conditionId,
      referenceHypothesisId:item.groundTruthHypothesisId
    }))
    .sort((a,b)=>a.trialId.localeCompare(b.trialId));
}

function validateArtifactFingerprint(value){
  if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value)){
    throw new TypeError("artifactFingerprint must be a 64-character lowercase hex SHA-256");
  }
}

function validateRanking(conditionId,ranking){
  const spec=getDifferentialSpec(conditionId);
  if(!spec) throw new TypeError("Unknown conditionId: "+conditionId);
  if(!Array.isArray(ranking)||!ranking.length) throw new TypeError("ranking is required");

  const expected=new Set(spec.hypotheses.map(item=>item.id));
  const seen=new Set();
  let sum=0;
  const canonical=[];

  for(const item of ranking){
    if(typeof item?.hypothesisId!=="string"||!expected.has(item.hypothesisId)){
      throw new TypeError("Prediction contains an undeclared hypothesis");
    }
    if(seen.has(item.hypothesisId)) throw new Error("Duplicate predicted hypothesis");
    seen.add(item.hypothesisId);

    const weight=item.posteriorWeight;
    if(typeof weight!=="number"||!Number.isFinite(weight)||weight<0||weight>1){
      throw new TypeError("posteriorWeight must be in [0,1]");
    }
    sum+=weight;
    canonical.push({
      hypothesisId:item.hypothesisId,
      posteriorWeight:round(weight)
    });
  }

  if(seen.size!==expected.size) throw new Error("Prediction must cover every declared hypothesis");
  for(const id of expected) if(!seen.has(id)) throw new Error("Prediction missing hypothesis "+id);
  if(Math.abs(sum-1)>1e-6) throw new Error("Prediction weights must sum to 1");

  return canonical.sort((a,b)=>a.hypothesisId.localeCompare(b.hypothesisId));
}

function topPrediction(ranking){
  return [...ranking].sort((a,b)=>
    b.posteriorWeight-a.posteriorWeight||
    a.hypothesisId.localeCompare(b.hypothesisId)
  )[0];
}

function summarizeRows(rows){
  const bins=calibrationBins(rows.map(row=>({
    confidence:row.confidence,
    correct:row.correct
  })));

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
    expectedCalibrationError:bins.expectedCalibrationError,
    calibrationBins:bins.bins,
    confusionMatrix:confusionMatrix(rows),
    byCondition
  };
}

export function verifyEvaluationReceipt(receipt){
  if(!receipt||typeof receipt!=="object") return false;
  const {fingerprint:stored,...body}=receipt;
  return typeof stored==="string"&&fingerprint(body)===stored;
}

export class SealedEvaluationHarness{
  #dataset;
  #publicCases;
  #referenceLabels;
  #labelCommitment;
  #evaluationSetFingerprint;
  #harnessId;
  #phase="READY";
  #model=null;
  #modelCommitment=null;
  #predictions=new Map();
  #predictionsCommitment=null;
  #report=null;

  constructor(dataset){
    validateEvaluationDataset(dataset);
    this.#dataset=clone(dataset);
    this.#publicCases=publicCases(dataset);
    this.#referenceLabels=referenceLabels(dataset);
    this.#labelCommitment=fingerprint({
      version:"REFERENCE_LABEL_COMMITMENT_V0.1",
      labels:this.#referenceLabels
    });
    this.#evaluationSetFingerprint=fingerprint({
      version:"PUBLIC_EVALUATION_SET_V0.1",
      cases:this.#publicCases
    });
    this.#harnessId=fingerprint({
      kind:"SIcologistSealedEvaluation",
      sourceDatasetFingerprint:dataset.fingerprint,
      evaluationSetFingerprint:this.#evaluationSetFingerprint,
      labelCommitment:this.#labelCommitment
    });
  }

  id(){ return this.#harnessId; }
  phase(){ return this.#phase; }

  manifest(){
    return {
      version:"SEALED_EVALUATION_V0.1",
      harnessId:this.#harnessId,
      phase:this.#phase,
      sourceDatasetFingerprint:this.#dataset.fingerprint,
      evaluationSetFingerprint:this.#evaluationSetFingerprint,
      labelCommitment:this.#labelCommitment,
      caseCount:this.#publicCases.length,
      cases:clone(this.#publicCases),
      labelsExposed:false,
      labelSemantics:"ADJUDICATED_REFERENCE",
      externalValidity:"CANDIDATE",
      custodyIndependence:"NOT_ESTABLISHED"
    };
  }

  registerModel({
    modelId,
    modelVersion,
    artifactFingerprint,
    metadata={}
  }){
    if(this.#phase!=="READY") throw new Error("Model registration is already frozen");
    if(typeof modelId!=="string"||!modelId.trim()) throw new TypeError("modelId is required");
    if(typeof modelVersion!=="string"||!modelVersion.trim()) throw new TypeError("modelVersion is required");
    validateArtifactFingerprint(artifactFingerprint);

    this.#model={
      modelId:modelId.trim(),
      modelVersion:modelVersion.trim(),
      artifactFingerprint,
      metadata:clone(metadata)
    };
    this.#modelCommitment=fingerprint({
      harnessId:this.#harnessId,
      model:this.#model
    });
    this.#phase="MODEL_FROZEN";

    return {
      modelCommitment:this.#modelCommitment,
      model:clone(this.#model)
    };
  }

  submitPrediction({trialId,ranking}){
    if(!["MODEL_FROZEN","PREDICTING"].includes(this.#phase)){
      throw new Error("Predictions are not accepted in phase "+this.#phase);
    }
    if(this.#predictions.has(trialId)) throw new Error("Prediction already submitted for "+trialId);

    const trial=this.#publicCases.find(item=>item.trialId===trialId);
    if(!trial) throw new Error("Unknown evaluation trialId: "+trialId);

    const canonicalRanking=validateRanking(trial.conditionId,ranking);
    const record={
      trialId,
      conditionId:trial.conditionId,
      ranking:canonicalRanking
    };
    const predictionId=fingerprint({
      harnessId:this.#harnessId,
      modelCommitment:this.#modelCommitment,
      prediction:record
    });
    this.#predictions.set(trialId,{predictionId,...record});
    this.#phase="PREDICTING";

    return {
      predictionId,
      trialId,
      submittedCount:this.#predictions.size,
      remainingCount:this.#publicCases.length-this.#predictions.size
    };
  }

  commitPredictions(){
    if(!["MODEL_FROZEN","PREDICTING"].includes(this.#phase)){
      throw new Error("Predictions cannot be committed in phase "+this.#phase);
    }
    if(!this.#modelCommitment) throw new Error("Model must be frozen before prediction commit");
    if(this.#predictions.size!==this.#publicCases.length){
      throw new Error("Every evaluation case must have exactly one prediction before commit");
    }

    const predictions=[...this.#predictions.values()]
      .map(clone)
      .sort((a,b)=>a.trialId.localeCompare(b.trialId));

    this.#predictionsCommitment=fingerprint({
      harnessId:this.#harnessId,
      modelCommitment:this.#modelCommitment,
      evaluationSetFingerprint:this.#evaluationSetFingerprint,
      predictions
    });
    this.#phase="PREDICTIONS_COMMITTED";

    return {
      predictionsCommitment:this.#predictionsCommitment,
      predictionCount:predictions.length,
      labelCommitment:this.#labelCommitment,
      labelsExposed:false
    };
  }

  revealAndScore({
    revealAuthorized=false,
    revealReceipt=null
  }={}){
    if(this.#phase!=="PREDICTIONS_COMMITTED"){
      throw new Error("Predictions must be committed before reference labels are revealed");
    }
    if(revealAuthorized!==true) throw new Error("Explicit reveal authorization is required");
    if(typeof revealReceipt!=="string"||!revealReceipt.trim()){
      throw new Error("A non-empty reveal receipt is required");
    }

    const currentLabelCommitment=fingerprint({
      version:"REFERENCE_LABEL_COMMITMENT_V0.1",
      labels:referenceLabels(this.#dataset)
    });
    if(currentLabelCommitment!==this.#labelCommitment){
      throw new Error("Reference-label commitment mismatch");
    }

    const predictions=[...this.#predictions.values()]
      .map(clone)
      .sort((a,b)=>a.trialId.localeCompare(b.trialId));
    const currentPredictionCommitment=fingerprint({
      harnessId:this.#harnessId,
      modelCommitment:this.#modelCommitment,
      evaluationSetFingerprint:this.#evaluationSetFingerprint,
      predictions
    });
    if(currentPredictionCommitment!==this.#predictionsCommitment){
      throw new Error("Prediction commitment mismatch");
    }

    const labelMap=new Map(this.#referenceLabels.map(item=>[item.trialId,item]));
    const rows=predictions.map(prediction=>{
      const reference=labelMap.get(prediction.trialId);
      const top=topPrediction(prediction.ranking);
      const truth=reference.referenceHypothesisId;
      return {
        trialId:prediction.trialId,
        conditionId:prediction.conditionId,
        truth,
        predicted:top.hypothesisId,
        confidence:top.posteriorWeight,
        correct:top.hypothesisId===truth,
        brier:multiclassBrier(prediction.ranking,truth),
        logLoss:logLoss(prediction.ranking,truth)
      };
    });

    const body={
      version:"SEALED_EVALUATION_RECEIPT_V0.1",
      harnessId:this.#harnessId,
      phase:"CLOSED",
      sourceDatasetFingerprint:this.#dataset.fingerprint,
      evaluationSetFingerprint:this.#evaluationSetFingerprint,
      labelCommitment:this.#labelCommitment,
      modelCommitment:this.#modelCommitment,
      model:clone(this.#model),
      predictionsCommitment:this.#predictionsCommitment,
      revealReceipt:revealReceipt.trim(),
      labelRevealTiming:"AFTER_PREDICTION_COMMIT",
      labelSemantics:"ADJUDICATED_REFERENCE",
      evaluationStatus:"SEALED_REFERENCE_EVALUATION_COMPLETE",
      externalValidity:"CANDIDATE",
      custodyIndependence:"NOT_ESTABLISHED",
      productionStatus:"NOT_VALIDATED",
      metrics:summarizeRows(rows),
      scoredCases:rows,
      integrity:{
        datasetFingerprintVerified:true,
        labelCommitmentVerified:true,
        predictionCommitmentVerified:true,
        modelCommitmentPresent:true
      }
    };

    this.#report={...body,fingerprint:fingerprint(body)};
    this.#phase="CLOSED";
    return clone(this.#report);
  }

  snapshot(){
    if(this.#phase==="CLOSED") return clone(this.#report);
    return {
      ...this.manifest(),
      modelCommitment:this.#modelCommitment,
      model:this.#model?clone(this.#model):null,
      submittedPredictions:this.#predictions.size,
      predictionsCommitment:this.#predictionsCommitment
    };
  }
}
