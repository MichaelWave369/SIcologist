import {fingerprint} from "../experiment/fingerprint.js";
import {verifyReplicationProtocol,verifyReplicationReceipt} from "./protocol.js";

export const REPLICATION_EVIDENCE_GRADES=Object.freeze([
  "NO_REPLICATION_EVIDENCE",
  "SINGLE_REPLICATION_SUPPORT",
  "MULTI_REPLICATOR_SUPPORT",
  "CROSS_ENVIRONMENT_SUPPORT",
  "ROBUST_REPLICATION_CANDIDATE"
]);

export const DEFAULT_EVIDENCE_LADDER_POLICY=Object.freeze({
  multi:{
    minSupportReplicators:2,
    minSupportRate:2/3
  },
  crossEnvironment:{
    minSupportReplicators:3,
    minEnvironmentFamilies:2,
    minSupportRate:.75
  },
  robustCandidate:{
    minSupportReplicators:4,
    minEnvironmentFamilies:3,
    minComparableRuns:5,
    minSupportRate:.8,
    maxDivergenceRate:.2
  }
});

const SUPPORT_STATUSES=new Set(["REPLAY_EXACT","REPLICATION_WITHIN_TOLERANCE"]);
const COMPARABLE_STATUSES=new Set([
  "REPLAY_EXACT",
  "REPLICATION_WITHIN_TOLERANCE",
  "REPLICATION_DIVERGED"
]);

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }
function mean(values){ return values.length?values.reduce((a,b)=>a+b,0)/values.length:null; }

function validatePolicy(policy){
  const merged={
    multi:{...DEFAULT_EVIDENCE_LADDER_POLICY.multi,...(policy?.multi??{})},
    crossEnvironment:{...DEFAULT_EVIDENCE_LADDER_POLICY.crossEnvironment,...(policy?.crossEnvironment??{})},
    robustCandidate:{...DEFAULT_EVIDENCE_LADDER_POLICY.robustCandidate,...(policy?.robustCandidate??{})}
  };
  for(const [section,values] of Object.entries(merged)){
    for(const [key,value] of Object.entries(values)){
      if(typeof value!=="number"||!Number.isFinite(value)||value<0){
        throw new TypeError("Invalid evidence ladder policy "+section+"."+key);
      }
      if(/Rate$/.test(key)&&(value<0||value>1)){
        throw new TypeError(section+"."+key+" must be in [0,1]");
      }
    }
  }
  return merged;
}

function evidenceUnit(receipt){
  return receipt.observedReceiptFingerprint??receipt.fingerprint;
}

function uniqueEvidence(receipts){
  const byUnit=new Map();
  for(const receipt of receipts){
    const key=evidenceUnit(receipt);
    if(!byUnit.has(key)) byUnit.set(key,receipt);
  }
  return [...byUnit.values()];
}

function environmentFamily(receipt){
  return receipt?.environment?.observed?.fingerprint??fingerprint({
    os:receipt?.environment?.observed?.os??null,
    arch:receipt?.environment?.observed?.arch??null,
    runtimeFamily:receipt?.environment?.observed?.runtimeFamily??null,
    runtimeVersion:receipt?.environment?.observed?.runtimeVersion??null,
    hardwareClass:receipt?.environment?.observed?.hardwareClass??null,
    containerFingerprint:receipt?.environment?.observed?.containerFingerprint??null
  });
}

function heterogeneity(receipts){
  const metricKeys=["accuracy","multiclassBrier","logLoss","expectedCalibrationError"];
  const metrics={};
  for(const key of metricKeys){
    const values=receipts
      .map(r=>r?.metrics?.absoluteDeltas?.[key])
      .filter(v=>typeof v==="number"&&Number.isFinite(v));
    metrics[key]=values.length?{
      n:values.length,
      meanAbsoluteDelta:round(mean(values)),
      minAbsoluteDelta:round(Math.min(...values)),
      maxAbsoluteDelta:round(Math.max(...values))
    }:{n:0,meanAbsoluteDelta:null,minAbsoluteDelta:null,maxAbsoluteDelta:null};
  }
  const agreements=receipts
    .map(r=>r?.predictions?.agreement)
    .filter(v=>typeof v==="number"&&Number.isFinite(v));
  return {
    metrics,
    predictionAgreement:agreements.length?{
      n:agreements.length,
      mean:round(mean(agreements)),
      min:round(Math.min(...agreements)),
      max:round(Math.max(...agreements))
    }:{n:0,mean:null,min:null,max:null}
  };
}

function evidenceGrade(summary,policy){
  if(summary.supportCount<1) return "NO_REPLICATION_EVIDENCE";

  let grade="SINGLE_REPLICATION_SUPPORT";

  if(
    summary.supportReplicatorCount>=policy.multi.minSupportReplicators&&
    summary.supportRate>=policy.multi.minSupportRate
  ){
    grade="MULTI_REPLICATOR_SUPPORT";
  }

  if(
    summary.supportReplicatorCount>=policy.crossEnvironment.minSupportReplicators&&
    summary.supportEnvironmentCount>=policy.crossEnvironment.minEnvironmentFamilies&&
    summary.supportRate>=policy.crossEnvironment.minSupportRate
  ){
    grade="CROSS_ENVIRONMENT_SUPPORT";
  }

  if(
    summary.supportReplicatorCount>=policy.robustCandidate.minSupportReplicators&&
    summary.supportEnvironmentCount>=policy.robustCandidate.minEnvironmentFamilies&&
    summary.comparableCount>=policy.robustCandidate.minComparableRuns&&
    summary.supportRate>=policy.robustCandidate.minSupportRate&&
    summary.divergenceRate<=policy.robustCandidate.maxDivergenceRate
  ){
    grade="ROBUST_REPLICATION_CANDIDATE";
  }

  return grade;
}

export class ReplicationEvidenceRegistry{
  #protocol;
  #policy;
  #receipts=new Map();

  constructor(protocol,{policy={}}={}){
    if(!verifyReplicationProtocol(protocol)) throw new Error("Replication protocol fingerprint mismatch");
    this.#protocol=clone(protocol);
    this.#policy=validatePolicy(policy);
  }

  register(receipt){
    if(!verifyReplicationReceipt(receipt)) throw new Error("Replication receipt fingerprint mismatch");
    if(receipt.protocolFingerprint!==this.#protocol.fingerprint){
      throw new Error("Receipt belongs to a different replication protocol");
    }
    if(this.#receipts.has(receipt.fingerprint)){
      throw new Error("DUPLICATE_REPLICATION_RECEIPT");
    }
    this.#receipts.set(receipt.fingerprint,clone(receipt));
    return {registered:true,fingerprint:receipt.fingerprint,total:this.#receipts.size};
  }

  receipts(){
    return [...this.#receipts.values()]
      .map(clone)
      .sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
  }

  summary(){
    const all=this.receipts();
    const unique=uniqueEvidence(all);
    const statusCounts={};
    for(const receipt of all){
      statusCounts[receipt.replicationStatus]=(statusCounts[receipt.replicationStatus]??0)+1;
    }

    const comparable=unique.filter(r=>COMPARABLE_STATUSES.has(r.replicationStatus));
    const supportive=comparable.filter(r=>SUPPORT_STATUSES.has(r.replicationStatus));
    const divergent=comparable.filter(r=>r.replicationStatus==="REPLICATION_DIVERGED");

    const supportReplicators=new Set(supportive.map(r=>r.replicatorId));
    const allReplicators=new Set(unique.map(r=>r.replicatorId));
    const supportEnvironments=new Set(supportive.map(environmentFamily));
    const allEnvironments=new Set(unique.map(environmentFamily));

    const supportRate=comparable.length?supportive.length/comparable.length:0;
    const divergenceRate=comparable.length?divergent.length/comparable.length:0;

    const reusedEvidence=[...new Set(all.map(evidenceUnit))]
      .map(unit=>({
        evidenceUnit:unit,
        receipts:all.filter(r=>evidenceUnit(r)===unit).map(r=>r.fingerprint).sort(),
        replicators:[...new Set(all.filter(r=>evidenceUnit(r)===unit).map(r=>r.replicatorId))].sort()
      }))
      .filter(item=>item.receipts.length>1)
      .sort((a,b)=>a.evidenceUnit.localeCompare(b.evidenceUnit));

    const base={
      version:"REPLICATION_REGISTRY_SUMMARY_V0.1",
      protocolFingerprint:this.#protocol.fingerprint,
      registeredReceiptCount:all.length,
      uniqueEvidenceCount:unique.length,
      duplicateEvidenceReuseCount:reusedEvidence.length,
      statusCounts,
      declaredReplicatorCount:allReplicators.size,
      supportReplicatorCount:supportReplicators.size,
      environmentCount:allEnvironments.size,
      supportEnvironmentCount:supportEnvironments.size,
      comparableCount:comparable.length,
      supportCount:supportive.length,
      divergenceCount:divergent.length,
      supportRate:round(supportRate),
      divergenceRate:round(divergenceRate),
      heterogeneity:heterogeneity(comparable),
      reusedEvidence,
      adverseEvidence:unique
        .filter(r=>!SUPPORT_STATUSES.has(r.replicationStatus))
        .map(r=>({
          fingerprint:r.fingerprint,
          replicatorId:r.replicatorId,
          status:r.replicationStatus,
          artifactMismatches:[...(r.artifactMismatches??[])],
          integrityErrors:[...(r.integrityErrors??[])]
        }))
        .sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint)),
      policy:clone(this.#policy),
      evidenceBoundary:{
        replicatorIdentity:"DECLARED_NOT_VERIFIED",
        replicationIndependence:"NOT_ESTABLISHED",
        externalValidity:"CANDIDATE",
        scientificTruth:"NOT_ESTABLISHED"
      }
    };

    const grade=evidenceGrade(base,this.#policy);
    const body={
      ...base,
      evidenceGrade:grade,
      promotionStatus:grade==="ROBUST_REPLICATION_CANDIDATE"
        ?"EVIDENCE_LADDER_TOP_CANDIDATE"
        :"NOT_TOP_GRADE"
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  export(){
    const body={
      version:"REPLICATION_REGISTRY_V0.1",
      protocol:clone(this.#protocol),
      policy:clone(this.#policy),
      receipts:this.receipts()
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="REPLICATION_REGISTRY_V0.1") throw new TypeError("Unsupported registry version");
    const {fingerprint:stored,...body}=snapshot;
    if(fingerprint(body)!==stored) throw new Error("Replication registry fingerprint mismatch");
    const registry=new ReplicationEvidenceRegistry(snapshot.protocol,{policy:snapshot.policy});
    for(const receipt of snapshot.receipts??[]) registry.register(receipt);
    return registry;
  }
}
