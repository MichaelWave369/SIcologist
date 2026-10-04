import {fingerprint} from "../experiment/fingerprint.js";
import {getDifferentialSpec} from "../differential/catalog.js";
import {calibrationBins,confusionMatrix,logLoss,multiclassBrier} from "../calibration/metrics.js";
import {signEvaluatorReceipt} from "./signature.js";

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }
function mean(values){ return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null; }

function fingerprinted(body){
  return {...body,fingerprint:fingerprint(body)};
}

function stripFingerprint(value){
  const {fingerprint:ignored,...body}=value??{};
  return body;
}

function verifyFingerprint(value){
  return Boolean(value&&typeof value.fingerprint==="string"&&fingerprint(stripFingerprint(value))===value.fingerprint);
}

function sortedPublicCases(dataset){
  return (dataset?.cases??[])
    .map(item=>({
      trialId:item.trialId,
      conditionId:item.conditionId,
      outcomes:clone(item.outcomes)
    }))
    .sort((a,b)=>a.trialId.localeCompare(b.trialId));
}

function sortedLabels(dataset){
  return (dataset?.cases??[])
    .map(item=>({
      trialId:item.trialId,
      conditionId:item.conditionId,
      referenceHypothesisId:item.groundTruthHypothesisId
    }))
    .sort((a,b)=>a.trialId.localeCompare(b.trialId));
}

function validateQuarantineDataset(dataset){
  if(dataset?.kind!=="REAL_CASE_EVAL_QUARANTINE"){
    throw new TypeError("Custody split requires REAL_CASE_EVAL_QUARANTINE");
  }
  if(dataset?.labelSemantics!=="ADJUDICATED_REFERENCE"){
    throw new Error("Evaluation labels must use ADJUDICATED_REFERENCE semantics");
  }
  if(!Array.isArray(dataset?.cases)||!dataset.cases.length){
    throw new Error("Evaluation quarantine is empty");
  }

  const body={
    version:dataset.version,
    kind:dataset.kind,
    externalValidity:dataset.externalValidity,
    labelSemantics:dataset.labelSemantics,
    cases:dataset.cases
  };
  if(fingerprint(body)!==dataset.fingerprint){
    throw new Error("Evaluation dataset fingerprint mismatch");
  }

  const ids=new Set();
  for(const item of dataset.cases){
    if(ids.has(item.trialId)) throw new Error("Duplicate trialId");
    ids.add(item.trialId);
    if(item.split!=="EVAL_QUARANTINE"||item.neverTrain!==true){
      throw new Error("Evaluation case is not properly quarantined");
    }
    const spec=getDifferentialSpec(item.conditionId);
    if(!spec) throw new Error("Unknown condition: "+item.conditionId);
    if(!spec.hypotheses.some(h=>h.id===item.groundTruthHypothesisId)){
      throw new Error("Undeclared reference label");
    }
    for(const probe of spec.probes){
      if(!["POSITIVE","NEGATIVE"].includes(item.outcomes?.[probe.probeId])){
        throw new Error("Missing binary outcome for "+probe.probeId);
      }
    }
  }
}

export function createIndependentCustodySplit(dataset,{
  evaluatorId,
  protocolNote=""
}={}){
  validateQuarantineDataset(dataset);
  if(typeof evaluatorId!=="string"||!evaluatorId.trim()) throw new TypeError("evaluatorId is required");

  const cases=sortedPublicCases(dataset);
  const labels=sortedLabels(dataset);
  const labelCommitment=fingerprint({
    version:"REFERENCE_LABEL_COMMITMENT_V0.1",
    labels
  });
  const evaluationSetFingerprint=fingerprint({
    version:"PUBLIC_EVALUATION_SET_V0.1",
    cases
  });
  const challengeId=fingerprint({
    kind:"SIcologistIndependentChallenge",
    sourceDatasetFingerprint:dataset.fingerprint,
    evaluationSetFingerprint,
    labelCommitment,
    evaluatorId:evaluatorId.trim()
  });

  const challengeBody={
    version:"INDEPENDENT_CHALLENGE_V0.1",
    challengeId,
    evaluatorId:evaluatorId.trim(),
    sourceDatasetFingerprint:dataset.fingerprint,
    evaluationSetFingerprint,
    labelCommitment,
    custodyProtocol:"SPLIT_PACKAGE_V0.1",
    labelsExposed:false,
    labelSemantics:"ADJUDICATED_REFERENCE",
    caseCount:cases.length,
    cases,
    protocolNote:String(protocolNote??"")
  };
  const challengeBundle=fingerprinted(challengeBody);

  const custodyBody={
    version:"PRIVATE_CUSTODY_V0.1",
    challengeId,
    evaluatorId:evaluatorId.trim(),
    sourceDatasetFingerprint:dataset.fingerprint,
    challengeFingerprint:challengeBundle.fingerprint,
    evaluationSetFingerprint,
    labelCommitment,
    custodyProtocol:"SPLIT_PACKAGE_V0.1",
    labelSemantics:"ADJUDICATED_REFERENCE",
    labels
  };
  const custodyBundle=fingerprinted(custodyBody);

  return {challengeBundle,custodyBundle};
}

function validateChallenge(challenge){
  if(challenge?.version!=="INDEPENDENT_CHALLENGE_V0.1") throw new TypeError("Unsupported challenge version");
  if(challenge?.labelsExposed!==false) throw new Error("Challenge bundle must remain label-hidden");
  if(!verifyFingerprint(challenge)) throw new Error("Challenge fingerprint mismatch");

  const setFingerprint=fingerprint({
    version:"PUBLIC_EVALUATION_SET_V0.1",
    cases:challenge.cases
  });
  if(setFingerprint!==challenge.evaluationSetFingerprint){
    throw new Error("Evaluation set fingerprint mismatch");
  }
}

function validateCustody(custody,challenge){
  if(custody?.version!=="PRIVATE_CUSTODY_V0.1") throw new TypeError("Unsupported custody version");
  if(!verifyFingerprint(custody)) throw new Error("Custody fingerprint mismatch");
  if(custody.challengeId!==challenge.challengeId) throw new Error("Custody challengeId mismatch");
  if(custody.challengeFingerprint!==challenge.fingerprint) throw new Error("Custody challenge fingerprint mismatch");
  if(custody.evaluationSetFingerprint!==challenge.evaluationSetFingerprint){
    throw new Error("Custody evaluation set fingerprint mismatch");
  }

  const labelCommitment=fingerprint({
    version:"REFERENCE_LABEL_COMMITMENT_V0.1",
    labels:custody.labels
  });
  if(labelCommitment!==custody.labelCommitment||labelCommitment!==challenge.labelCommitment){
    throw new Error("Reference label commitment mismatch");
  }
}

function normalizeRanking(conditionId,ranking){
  const spec=getDifferentialSpec(conditionId);
  if(!spec) throw new TypeError("Unknown conditionId: "+conditionId);
  if(!Array.isArray(ranking)||!ranking.length) throw new TypeError("ranking is required");

  const expected=new Set(spec.hypotheses.map(item=>item.id));
  const seen=new Set();
  let total=0;
  const normalized=[];

  for(const row of ranking){
    if(!expected.has(row?.hypothesisId)) throw new Error("Undeclared hypothesis in prediction");
    if(seen.has(row.hypothesisId)) throw new Error("Duplicate hypothesis in prediction");
    const weight=row.posteriorWeight;
    if(typeof weight!=="number"||!Number.isFinite(weight)||weight<0||weight>1){
      throw new TypeError("posteriorWeight must be in [0,1]");
    }
    seen.add(row.hypothesisId);
    total+=weight;
    normalized.push({
      hypothesisId:row.hypothesisId,
      posteriorWeight:round(weight)
    });
  }

  if(seen.size!==expected.size) throw new Error("Prediction must cover the full hypothesis space");
  if(Math.abs(total-1)>1e-6) throw new Error("Prediction weights must sum to 1");

  return normalized.sort((a,b)=>a.hypothesisId.localeCompare(b.hypothesisId));
}

export function createIndependentSubmission(challenge,{
  modelId,
  modelVersion,
  artifactFingerprint,
  predictions,
  runnerAttestation=""
}){
  validateChallenge(challenge);
  if(typeof modelId!=="string"||!modelId.trim()) throw new TypeError("modelId is required");
  if(typeof modelVersion!=="string"||!modelVersion.trim()) throw new TypeError("modelVersion is required");
  if(typeof artifactFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(artifactFingerprint)){
    throw new TypeError("artifactFingerprint must be a 64-character lowercase hex SHA-256");
  }
  if(!Array.isArray(predictions)) throw new TypeError("predictions must be an array");

  const publicById=new Map(challenge.cases.map(item=>[item.trialId,item]));
  const seen=new Set();
  const canonicalPredictions=predictions.map(item=>{
    const trial=publicById.get(item.trialId);
    if(!trial) throw new Error("Unknown challenge trialId: "+item.trialId);
    if(seen.has(item.trialId)) throw new Error("Duplicate prediction for "+item.trialId);
    seen.add(item.trialId);
    return {
      trialId:item.trialId,
      conditionId:trial.conditionId,
      ranking:normalizeRanking(trial.conditionId,item.ranking)
    };
  }).sort((a,b)=>a.trialId.localeCompare(b.trialId));

  if(canonicalPredictions.length!==challenge.cases.length){
    throw new Error("Every challenge case must have exactly one prediction");
  }

  const model={
    modelId:modelId.trim(),
    modelVersion:modelVersion.trim(),
    artifactFingerprint
  };
  const modelCommitment=fingerprint({
    challengeId:challenge.challengeId,
    model
  });
  const predictionsCommitment=fingerprint({
    challengeId:challenge.challengeId,
    challengeFingerprint:challenge.fingerprint,
    modelCommitment,
    predictions:canonicalPredictions
  });

  const body={
    version:"INDEPENDENT_SUBMISSION_V0.1",
    challengeId:challenge.challengeId,
    challengeFingerprint:challenge.fingerprint,
    evaluationSetFingerprint:challenge.evaluationSetFingerprint,
    labelCommitment:challenge.labelCommitment,
    labelsSeen:false,
    model,
    modelCommitment,
    predictions:canonicalPredictions,
    predictionsCommitment,
    runnerAttestation:String(runnerAttestation??"")
  };
  return fingerprinted(body);
}

function validateSubmission(submission,challenge){
  if(submission?.version!=="INDEPENDENT_SUBMISSION_V0.1") throw new TypeError("Unsupported submission version");
  if(!verifyFingerprint(submission)) throw new Error("Submission fingerprint mismatch");
  if(submission.labelsSeen!==false) throw new Error("Submission must attest labelsSeen=false");
  if(submission.challengeId!==challenge.challengeId) throw new Error("Submission challengeId mismatch");
  if(submission.challengeFingerprint!==challenge.fingerprint) throw new Error("Submission challenge fingerprint mismatch");
  if(submission.evaluationSetFingerprint!==challenge.evaluationSetFingerprint){
    throw new Error("Submission evaluation set fingerprint mismatch");
  }
  if(submission.labelCommitment!==challenge.labelCommitment){
    throw new Error("Submission label commitment mismatch");
  }

  const modelCommitment=fingerprint({
    challengeId:challenge.challengeId,
    model:submission.model
  });
  if(modelCommitment!==submission.modelCommitment) throw new Error("Model commitment mismatch");

  const predictionsCommitment=fingerprint({
    challengeId:challenge.challengeId,
    challengeFingerprint:challenge.fingerprint,
    modelCommitment:submission.modelCommitment,
    predictions:submission.predictions
  });
  if(predictionsCommitment!==submission.predictionsCommitment){
    throw new Error("Prediction commitment mismatch");
  }

  const predictionIds=new Set(submission.predictions.map(item=>item.trialId));
  if(predictionIds.size!==challenge.cases.length) throw new Error("Submission coverage mismatch");
  for(const item of challenge.cases){
    if(!predictionIds.has(item.trialId)) throw new Error("Missing prediction for "+item.trialId);
  }
}

function top(ranking){
  return [...ranking].sort((a,b)=>
    b.posteriorWeight-a.posteriorWeight||
    a.hypothesisId.localeCompare(b.hypothesisId)
  )[0];
}

function summarize(rows){
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

export function scoreIndependentSubmission({
  challengeBundle,
  custodyBundle,
  submissionBundle,
  evaluatorReceipt
}){
  validateChallenge(challengeBundle);
  validateCustody(custodyBundle,challengeBundle);
  validateSubmission(submissionBundle,challengeBundle);

  if(custodyBundle.evaluatorId!==challengeBundle.evaluatorId){
    throw new Error("Evaluator identity mismatch between custody and challenge");
  }
  if(typeof evaluatorReceipt!=="string"||!evaluatorReceipt.trim()){
    throw new Error("evaluatorReceipt is required");
  }

  const labelMap=new Map(custodyBundle.labels.map(item=>[item.trialId,item]));
  const rows=submissionBundle.predictions.map(prediction=>{
    const reference=labelMap.get(prediction.trialId);
    if(!reference) throw new Error("Private custody label missing for "+prediction.trialId);
    if(reference.conditionId!==prediction.conditionId) throw new Error("Condition mismatch at scoring");
    const predicted=top(prediction.ranking);
    const truth=reference.referenceHypothesisId;
    return {
      trialId:prediction.trialId,
      conditionId:prediction.conditionId,
      truth,
      predicted:predicted.hypothesisId,
      confidence:predicted.posteriorWeight,
      correct:predicted.hypothesisId===truth,
      brier:multiclassBrier(prediction.ranking,truth),
      logLoss:logLoss(prediction.ranking,truth)
    };
  });

  const body={
    version:"INDEPENDENT_EVALUATION_RECEIPT_V0.1",
    challengeId:challengeBundle.challengeId,
    challengeFingerprint:challengeBundle.fingerprint,
    custodyFingerprint:custodyBundle.fingerprint,
    evaluationSetFingerprint:challengeBundle.evaluationSetFingerprint,
    labelCommitment:challengeBundle.labelCommitment,
    model:clone(submissionBundle.model),
    modelCommitment:submissionBundle.modelCommitment,
    submissionFingerprint:submissionBundle.fingerprint,
    predictionsCommitment:submissionBundle.predictionsCommitment,
    evaluatorId:challengeBundle.evaluatorId,
    evaluatorReceipt:evaluatorReceipt.trim(),
    labelRevealTiming:"AFTER_EXTERNAL_SUBMISSION_COMMIT",
    labelSemantics:"ADJUDICATED_REFERENCE",
    custodySeparation:"SPLIT_PACKAGE_VERIFIED",
    custodyIndependence:"NOT_ESTABLISHED",
    identityAssurance:"UNSIGNED",
    externalValidity:"CANDIDATE",
    productionStatus:"NOT_VALIDATED",
    metrics:summarize(rows),
    scoredCases:rows,
    integrity:{
      challengeFingerprintVerified:true,
      custodyFingerprintVerified:true,
      labelCommitmentVerified:true,
      modelCommitmentVerified:true,
      predictionCommitmentVerified:true,
      labelsAbsentFromSubmission:true
    }
  };
  return fingerprinted(body);
}

export function signIndependentEvaluationReceipt(receipt,credentials){
  return signEvaluatorReceipt(receipt,credentials);
}

export function verifyIndependentEvaluationReceipt(receipt){
  return verifyFingerprint(receipt);
}
