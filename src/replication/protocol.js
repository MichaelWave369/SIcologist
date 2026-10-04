import {fingerprint} from "../experiment/fingerprint.js";

export const REPLICATION_STATUSES=Object.freeze([
  "REPLAY_EXACT",
  "REPLICATION_WITHIN_TOLERANCE",
  "REPLICATION_DIVERGED",
  "ENVIRONMENT_MISMATCH",
  "ARTIFACT_MISMATCH",
  "INSUFFICIENT_REPLICATION_EVIDENCE"
]);

const METRIC_KEYS=Object.freeze([
  "accuracy",
  "multiclassBrier",
  "logLoss",
  "expectedCalibrationError"
]);

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }

function stripFingerprint(value){
  const {fingerprint:ignored,...body}=value??{};
  return body;
}

function verifyFingerprint(value){
  return Boolean(
    value&&
    typeof value.fingerprint==="string"&&
    fingerprint(stripFingerprint(value))===value.fingerprint
  );
}

function sha256(value,name){
  if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value)){
    throw new TypeError(name+" must be a 64-character lowercase hex SHA-256");
  }
  return value;
}

function commitSha(value){
  if(typeof value!=="string"||!/^[a-f0-9]{40}$/.test(value)){
    throw new TypeError("sourceCommit must be a 40-character lowercase hex Git SHA");
  }
  return value;
}

function normalizeSeedSchedule(values){
  if(!Array.isArray(values)||!values.length) throw new TypeError("seedSchedule must be a non-empty array");
  const seen=new Set();
  return values.map(value=>{
    if(!Number.isSafeInteger(value)||value<0) throw new TypeError("seed values must be non-negative safe integers");
    if(seen.has(value)) throw new Error("seedSchedule must not contain duplicates");
    seen.add(value);
    return value;
  });
}

export function normalizeReplicationEnvironment(environment){
  const required=["os","arch","runtimeFamily","runtimeVersion"];
  for(const key of required){
    if(typeof environment?.[key]!=="string"||!environment[key].trim()){
      throw new TypeError("environment."+key+" is required");
    }
  }

  const body={
    os:environment.os.trim(),
    arch:environment.arch.trim(),
    runtimeFamily:environment.runtimeFamily.trim(),
    runtimeVersion:environment.runtimeVersion.trim(),
    hardwareClass:typeof environment.hardwareClass==="string"?environment.hardwareClass.trim():"",
    containerFingerprint:environment.containerFingerprint??null
  };
  if(body.containerFingerprint!==null){
    sha256(body.containerFingerprint,"environment.containerFingerprint");
  }

  return {...body,fingerprint:fingerprint(body)};
}

function coreMetrics(receipt){
  const metrics={};
  for(const key of METRIC_KEYS){
    const value=receipt?.metrics?.[key];
    if(typeof value!=="number"||!Number.isFinite(value)){
      throw new Error("Reference receipt missing metric "+key);
    }
    metrics[key]=round(value);
  }
  return metrics;
}

function predictionSummary(receipt){
  if(!Array.isArray(receipt?.scoredCases)||!receipt.scoredCases.length){
    throw new Error("Reference receipt needs scoredCases");
  }
  return receipt.scoredCases
    .map(row=>({
      trialId:row.trialId,
      conditionId:row.conditionId,
      predicted:row.predicted,
      confidence:round(row.confidence)
    }))
    .sort((a,b)=>a.trialId.localeCompare(b.trialId));
}

function normalizeTolerances(tolerances={}){
  const defaults={
    accuracy:0,
    multiclassBrier:0.01,
    logLoss:0.02,
    expectedCalibrationError:0.02,
    minPredictionAgreement:1
  };
  const merged={...defaults,...tolerances};
  for(const key of METRIC_KEYS){
    if(typeof merged[key]!=="number"||!Number.isFinite(merged[key])||merged[key]<0){
      throw new TypeError("tolerance "+key+" must be a finite number >= 0");
    }
  }
  if(
    typeof merged.minPredictionAgreement!=="number"||
    !Number.isFinite(merged.minPredictionAgreement)||
    merged.minPredictionAgreement<0||
    merged.minPredictionAgreement>1
  ){
    throw new TypeError("minPredictionAgreement must be in [0,1]");
  }
  return Object.fromEntries(Object.entries(merged).map(([k,v])=>[k,round(v)]));
}

function normalizeEnvironmentPolicy(policy={}){
  const defaultRequired=["runtimeFamily"];
  const requiredExact=policy.requiredExact??defaultRequired;
  if(!Array.isArray(requiredExact)) throw new TypeError("environmentPolicy.requiredExact must be an array");
  const allowed=new Set(["os","arch","runtimeFamily","runtimeVersion","hardwareClass","containerFingerprint"]);
  for(const field of requiredExact){
    if(!allowed.has(field)) throw new TypeError("Unsupported required environment field: "+field);
  }
  return {requiredExact:[...new Set(requiredExact)].sort()};
}

export function verifyReplicationProtocol(protocol){
  return Boolean(protocol?.version==="REPLICATION_PROTOCOL_V0.1"&&verifyFingerprint(protocol));
}

export function createReplicationProtocol({
  referenceReceipt,
  challengeBundle,
  sourceCommit,
  dependencyFingerprint,
  referenceEnvironment,
  seedSchedule=[0],
  tolerances={},
  environmentPolicy={}
}){
  if(referenceReceipt?.version!=="INDEPENDENT_EVALUATION_RECEIPT_V0.1"){
    throw new TypeError("referenceReceipt must be an independent evaluation receipt");
  }
  if(!verifyFingerprint(referenceReceipt)) throw new Error("Reference receipt fingerprint mismatch");
  if(challengeBundle?.version!=="INDEPENDENT_CHALLENGE_V0.1"){
    throw new TypeError("challengeBundle must be an independent challenge");
  }
  if(!verifyFingerprint(challengeBundle)) throw new Error("Challenge fingerprint mismatch");
  if(referenceReceipt.challengeFingerprint!==challengeBundle.fingerprint){
    throw new Error("Reference receipt and challenge do not match");
  }
  if(referenceReceipt.evaluationSetFingerprint!==challengeBundle.evaluationSetFingerprint){
    throw new Error("Evaluation-set fingerprint mismatch");
  }
  if(referenceReceipt.labelCommitment!==challengeBundle.labelCommitment){
    throw new Error("Label commitment mismatch");
  }

  const normalizedEnvironment=normalizeReplicationEnvironment(referenceEnvironment);
  const seeds=normalizeSeedSchedule(seedSchedule);
  const normalizedTolerances=normalizeTolerances(tolerances);
  const normalizedPolicy=normalizeEnvironmentPolicy(environmentPolicy);
  const modelArtifactFingerprint=sha256(
    referenceReceipt?.model?.artifactFingerprint,
    "reference model artifactFingerprint"
  );

  const body={
    version:"REPLICATION_PROTOCOL_V0.1",
    status:"FROZEN",
    reference:{
      receiptFingerprint:referenceReceipt.fingerprint,
      challengeFingerprint:challengeBundle.fingerprint,
      evaluationSetFingerprint:challengeBundle.evaluationSetFingerprint,
      labelCommitment:challengeBundle.labelCommitment,
      modelArtifactFingerprint,
      modelCommitment:referenceReceipt.modelCommitment,
      predictionsCommitment:referenceReceipt.predictionsCommitment,
      metrics:coreMetrics(referenceReceipt),
      predictions:predictionSummary(referenceReceipt)
    },
    artifacts:{
      sourceCommit:commitSha(sourceCommit),
      dependencyFingerprint:sha256(dependencyFingerprint,"dependencyFingerprint")
    },
    referenceEnvironment:normalizedEnvironment,
    environmentPolicy:normalizedPolicy,
    seedSchedule:seeds,
    tolerances:normalizedTolerances,
    evidenceBoundary:{
      replicationIndependence:"NOT_ESTABLISHED",
      externalValidity:"CANDIDATE",
      productionStatus:"NOT_VALIDATED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

function environmentComparison(reference,observed,policy){
  const fields=["os","arch","runtimeFamily","runtimeVersion","hardwareClass","containerFingerprint"];
  const drift=[];
  for(const field of fields){
    if(reference[field]!==observed[field]){
      drift.push({field,reference:reference[field],observed:observed[field]});
    }
  }
  const required=new Set(policy.requiredExact);
  return {
    drift,
    requiredMismatch:drift.filter(item=>required.has(item.field))
  };
}

function comparePredictions(reference,observedReceipt){
  const observed=predictionSummary(observedReceipt);
  const observedById=new Map(observed.map(row=>[row.trialId,row]));
  if(observed.length!==reference.length){
    return {complete:false,agreement:null,mismatches:[]};
  }

  let matches=0;
  const mismatches=[];
  for(const expected of reference){
    const actual=observedById.get(expected.trialId);
    if(!actual||actual.conditionId!==expected.conditionId){
      return {complete:false,agreement:null,mismatches:[]};
    }
    if(actual.predicted===expected.predicted){
      matches+=1;
    }else{
      mismatches.push({
        trialId:expected.trialId,
        reference:expected.predicted,
        observed:actual.predicted
      });
    }
  }
  return {
    complete:true,
    agreement:round(matches/reference.length),
    mismatches
  };
}

function metricComparison(reference,observed,tolerances){
  const deltas={};
  const within={};
  let allExact=true;
  let allWithin=true;
  for(const key of METRIC_KEYS){
    const value=observed?.metrics?.[key];
    if(typeof value!=="number"||!Number.isFinite(value)){
      return {complete:false,deltas:{},within:{},allExact:false,allWithin:false};
    }
    const delta=round(Math.abs(reference[key]-value));
    deltas[key]=delta;
    within[key]=delta<=tolerances[key];
    if(delta!==0) allExact=false;
    if(!within[key]) allWithin=false;
  }
  return {complete:true,deltas,within,allExact,allWithin};
}

export function verifyReplicationReceipt(receipt){
  return Boolean(receipt?.version==="REPLICATION_RECEIPT_V0.1"&&verifyFingerprint(receipt));
}

export function createReplicationReceipt(protocol,{
  replicatorId,
  challengeBundle,
  submissionBundle,
  evaluationReceipt,
  environment,
  sourceCommit,
  dependencyFingerprint,
  seedSchedule
}){
  if(!verifyReplicationProtocol(protocol)) throw new Error("Replication protocol fingerprint mismatch");
  if(typeof replicatorId!=="string"||!replicatorId.trim()) throw new TypeError("replicatorId is required");

  const observedEnvironment=normalizeReplicationEnvironment(environment);
  const environmentCheck=environmentComparison(
    protocol.referenceEnvironment,
    observedEnvironment,
    protocol.environmentPolicy
  );

  const artifactMismatches=[];
  const observedSourceCommit=commitSha(sourceCommit);
  const observedDependency=sha256(dependencyFingerprint,"dependencyFingerprint");
  const observedSeeds=normalizeSeedSchedule(seedSchedule);

  if(challengeBundle?.fingerprint!==protocol.reference.challengeFingerprint){
    artifactMismatches.push("challengeFingerprint");
  }
  if(evaluationReceipt?.evaluationSetFingerprint!==protocol.reference.evaluationSetFingerprint){
    artifactMismatches.push("evaluationSetFingerprint");
  }
  if(evaluationReceipt?.labelCommitment!==protocol.reference.labelCommitment){
    artifactMismatches.push("labelCommitment");
  }
  if(evaluationReceipt?.model?.artifactFingerprint!==protocol.reference.modelArtifactFingerprint){
    artifactMismatches.push("modelArtifactFingerprint");
  }
  if(observedSourceCommit!==protocol.artifacts.sourceCommit) artifactMismatches.push("sourceCommit");
  if(observedDependency!==protocol.artifacts.dependencyFingerprint) artifactMismatches.push("dependencyFingerprint");
  if(JSON.stringify(observedSeeds)!==JSON.stringify(protocol.seedSchedule)) artifactMismatches.push("seedSchedule");

  const integrityErrors=[];
  if(challengeBundle?.version!=="INDEPENDENT_CHALLENGE_V0.1"||!verifyFingerprint(challengeBundle)){
    integrityErrors.push("challenge");
  }
  if(submissionBundle?.version!=="INDEPENDENT_SUBMISSION_V0.1"||!verifyFingerprint(submissionBundle)){
    integrityErrors.push("submission");
  }
  if(evaluationReceipt?.version!=="INDEPENDENT_EVALUATION_RECEIPT_V0.1"||!verifyFingerprint(evaluationReceipt)){
    integrityErrors.push("evaluationReceipt");
  }
  if(submissionBundle?.challengeFingerprint!==challengeBundle?.fingerprint){
    integrityErrors.push("submissionChallengeBinding");
  }
  if(evaluationReceipt?.submissionFingerprint!==submissionBundle?.fingerprint){
    integrityErrors.push("receiptSubmissionBinding");
  }

  const metrics=integrityErrors.length?null:metricComparison(
    protocol.reference.metrics,
    evaluationReceipt,
    protocol.tolerances
  );
  const predictions=integrityErrors.length?null:comparePredictions(
    protocol.reference.predictions,
    evaluationReceipt
  );

  let replicationStatus;
  if(integrityErrors.length||!metrics?.complete||!predictions?.complete){
    replicationStatus="INSUFFICIENT_REPLICATION_EVIDENCE";
  }else if(artifactMismatches.length){
    replicationStatus="ARTIFACT_MISMATCH";
  }else if(environmentCheck.requiredMismatch.length){
    replicationStatus="ENVIRONMENT_MISMATCH";
  }else{
    const predictionCommitmentExact=
      evaluationReceipt.predictionsCommitment===protocol.reference.predictionsCommitment;
    const exact=
      predictionCommitmentExact&&
      metrics.allExact&&
      predictions.agreement===1;
    const within=
      metrics.allWithin&&
      predictions.agreement>=protocol.tolerances.minPredictionAgreement;

    replicationStatus=exact
      ?"REPLAY_EXACT"
      :within
        ?"REPLICATION_WITHIN_TOLERANCE"
        :"REPLICATION_DIVERGED";
  }

  const body={
    version:"REPLICATION_RECEIPT_V0.1",
    protocolFingerprint:protocol.fingerprint,
    replicatorId:replicatorId.trim(),
    replicationStatus,
    referenceReceiptFingerprint:protocol.reference.receiptFingerprint,
    observedReceiptFingerprint:evaluationReceipt?.fingerprint??null,
    artifactMismatches,
    integrityErrors,
    environment:{
      reference:clone(protocol.referenceEnvironment),
      observed:observedEnvironment,
      drift:environmentCheck.drift,
      requiredMismatch:environmentCheck.requiredMismatch
    },
    metrics:metrics?{
      reference:clone(protocol.reference.metrics),
      observed:coreMetrics(evaluationReceipt),
      absoluteDeltas:metrics.deltas,
      withinTolerance:metrics.within
    }:null,
    predictions:predictions?{
      agreement:predictions.agreement,
      mismatches:predictions.mismatches,
      referenceCommitment:protocol.reference.predictionsCommitment,
      observedCommitment:evaluationReceipt.predictionsCommitment,
      commitmentExact:
        evaluationReceipt.predictionsCommitment===protocol.reference.predictionsCommitment
    }:null,
    artifacts:{
      sourceCommit:observedSourceCommit,
      dependencyFingerprint:observedDependency,
      seedSchedule:observedSeeds
    },
    evidenceBoundary:{
      replicationIndependence:"NOT_ESTABLISHED",
      externalValidity:"CANDIDATE",
      productionStatus:"NOT_VALIDATED"
    }
  };

  return {...body,fingerprint:fingerprint(body)};
}
