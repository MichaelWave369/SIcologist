import {fingerprint} from "../experiment/fingerprint.js";
import {getProbeSpec} from "../experiment/probes.js";
import {
  CLAIM_CHALLENGE_OUTCOMES,
  CLAIM_CHALLENGE_STATES,
  evidenceRelationForChallengeOutcome
} from "./types.js";

function clone(value){ return structuredClone(value); }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function cleanStrings(values=[]){
  if(!Array.isArray(values)) throw new TypeError("boundaryConditions must be an array");
  return [...new Set(
    values
      .filter(value=>typeof value==="string"&&value.trim())
      .map(value=>value.trim())
  )].sort();
}

function normalizeDecisionTable(table){
  if(!table||typeof table!=="object"||Array.isArray(table)){
    throw new TypeError("decisionTable must be an object");
  }
  const rows=Object.entries(table)
    .filter(([label])=>typeof label==="string"&&label.trim())
    .map(([label,outcome])=>[label.trim(),outcome])
    .sort(([a],[b])=>a.localeCompare(b));

  if(rows.length<2) throw new Error("decisionTable requires at least two observation labels");

  const normalized={};
  for(const [label,outcome] of rows){
    if(!CLAIM_CHALLENGE_OUTCOMES.includes(outcome)){
      throw new TypeError("Unsupported challenge outcome in decisionTable: "+outcome);
    }
    if(normalized[label]) throw new Error("Duplicate observation label: "+label);
    normalized[label]=outcome;
  }

  const outcomes=new Set(Object.values(normalized));
  if(!outcomes.has("SURVIVED_CHALLENGE")){
    throw new Error("decisionTable must include at least one SURVIVED_CHALLENGE outcome");
  }
  if(!outcomes.has("CONTRADICTED")){
    throw new Error("decisionTable must include at least one CONTRADICTED outcome");
  }
  return normalized;
}

function requireCurrentClaim(claimRegistry,claimId,name){
  if(!claimRegistry||typeof claimRegistry.claim!=="function"){
    throw new TypeError("claimRegistry with claim() is required");
  }
  const claim=claimRegistry.claim(claimId);
  if(!claim) throw new Error("Unknown "+name+" claimId");
  if(claim.supersededBy) throw new Error(name+" claim revision is superseded");
  return claim;
}

export class ClaimChallengeRegistry{
  #contracts=new Map();
  #results=new Map();

  preregister(claimRegistry,{
    targetClaimId,
    rivalClaimId,
    challengeQuestion,
    expectedObservation,
    falsifier,
    boundaryConditions=[],
    probeId,
    decisionTable,
    preregistrationNote=""
  }){
    const target=requireCurrentClaim(claimRegistry,targetClaimId,"target");
    const rival=requireCurrentClaim(claimRegistry,rivalClaimId,"rival");
    if(targetClaimId===rivalClaimId) throw new Error("Target and rival claims must differ");

    if(typeof challengeQuestion!=="string"||!challengeQuestion.trim()){
      throw new TypeError("challengeQuestion is required");
    }
    if(typeof expectedObservation!=="string"||!expectedObservation.trim()){
      throw new TypeError("expectedObservation is required");
    }
    if(typeof falsifier!=="string"||!falsifier.trim()){
      throw new TypeError("falsifier is required");
    }

    const probe=getProbeSpec(probeId);
    if(!probe) throw new Error("Unknown discriminating probe: "+probeId);
    const normalizedTable=normalizeDecisionTable(decisionTable);

    const body={
      version:"CLAIM_CHALLENGE_V0.1",
      target:{
        claimId:target.claimId,
        claimKey:target.claimKey,
        revision:target.revision
      },
      rival:{
        claimId:rival.claimId,
        claimKey:rival.claimKey,
        revision:rival.revision
      },
      challengeQuestion:challengeQuestion.trim(),
      expectedObservation:expectedObservation.trim(),
      falsifier:falsifier.trim(),
      boundaryConditions:cleanStrings(boundaryConditions),
      discriminatingProbe:{
        probeId:probe.id,
        executionMode:probe.executionMode,
        mutatesPrimary:probe.mutatesPrimary
      },
      decisionTable:normalizedTable,
      preregistrationNote:typeof preregistrationNote==="string"?preregistrationNote.trim():"",
      boundaries:{
        targetProvenBySurvival:false,
        rivalProvenByContradiction:false,
        causalityEstablished:false
      }
    };
    const contractId=fingerprint(body);
    if(this.#contracts.has(contractId)) throw new Error("DUPLICATE_CHALLENGE_CONTRACT");

    const record={...body,contractId,state:"PREREGISTERED"};
    this.#contracts.set(contractId,record);
    return clone(record);
  }

  contract(contractId){
    const value=this.#contracts.get(contractId);
    return value?clone(value):null;
  }

  result(contractId){
    const value=this.#results.get(contractId);
    return value?clone(value):null;
  }

  recordResult(claimRegistry,contractId,{
    observationLabel,
    evidenceArtifact,
    evaluatorId,
    note=""
  }){
    const contract=this.#contracts.get(contractId);
    if(!contract) throw new Error("Unknown challenge contract");
    if(this.#results.has(contractId)) throw new Error("CHALLENGE_ALREADY_RESOLVED");

    const target=requireCurrentClaim(claimRegistry,contract.target.claimId,"target");
    const rival=requireCurrentClaim(claimRegistry,contract.rival.claimId,"rival");
    if(target.revision!==contract.target.revision||rival.revision!==contract.rival.revision){
      throw new Error("Claim revision no longer matches preregistered challenge");
    }

    if(typeof observationLabel!=="string"||!observationLabel.trim()){
      throw new TypeError("observationLabel is required");
    }
    const cleanLabel=observationLabel.trim();
    const outcome=contract.decisionTable[cleanLabel];
    if(!outcome){
      throw new Error("Observation label was not preregistered: "+cleanLabel);
    }
    if(typeof evaluatorId!=="string"||!evaluatorId.trim()){
      throw new TypeError("evaluatorId is required");
    }
    if(!verifyFingerprint(evidenceArtifact)){
      throw new Error("Challenge evidence artifact fingerprint mismatch");
    }

    const body={
      version:"CLAIM_CHALLENGE_RESULT_V0.1",
      contractId,
      targetClaimId:contract.target.claimId,
      rivalClaimId:contract.rival.claimId,
      probeId:contract.discriminatingProbe.probeId,
      observationLabel:cleanLabel,
      outcome,
      evidenceFingerprint:evidenceArtifact.fingerprint,
      evaluatorId:evaluatorId.trim(),
      note:typeof note==="string"?note:"",
      interpretation:{
        targetClaimProven:false,
        rivalClaimProven:false,
        causalityEstablished:false,
        resultScope:"PREREGISTERED_CHALLENGE_ONLY"
      }
    };
    const result={...body,fingerprint:fingerprint(body)};
    this.#results.set(contractId,result);
    this.#contracts.set(contractId,{...contract,state:"RESOLVED"});
    return clone(result);
  }

  attachResultToTargetClaim(claimRegistry,contractId,{
    sourceLabel="Rung 15 preregistered claim challenge",
    note=""
  }={}){
    const result=this.#results.get(contractId);
    if(!result) throw new Error("Challenge has no result");
    const relation=evidenceRelationForChallengeOutcome(result.outcome);
    return claimRegistry.registerEvidence({
      claimId:result.targetClaimId,
      evidenceType:"CLAIM_CHALLENGE_RESULT",
      relation,
      artifact:result,
      sourceLabel,
      note
    });
  }

  summary(contractId){
    const contract=this.#contracts.get(contractId);
    if(!contract) throw new Error("Unknown challenge contract");
    const result=this.#results.get(contractId)??null;
    const body={
      version:"CLAIM_CHALLENGE_SUMMARY_V0.1",
      contractId,
      state:result?"RESOLVED":"PREREGISTERED",
      targetClaimId:contract.target.claimId,
      rivalClaimId:contract.rival.claimId,
      probeId:contract.discriminatingProbe.probeId,
      observationLabels:Object.keys(contract.decisionTable).sort(),
      outcome:result?.outcome??null,
      resultFingerprint:result?.fingerprint??null,
      boundaries:{
        survivalDoesNotProveClaim:true,
        contradictionDoesNotProveRival:true,
        causalityEstablished:false
      }
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  export(){
    const body={
      version:"CLAIM_CHALLENGE_REGISTRY_V0.1",
      contracts:[...this.#contracts.values()]
        .map(clone)
        .sort((a,b)=>a.contractId.localeCompare(b.contractId)),
      results:[...this.#results.values()]
        .map(clone)
        .sort((a,b)=>a.contractId.localeCompare(b.contractId))
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="CLAIM_CHALLENGE_REGISTRY_V0.1"){
      throw new TypeError("Unsupported challenge registry version");
    }
    const {fingerprint:stored,...body}=snapshot;
    if(fingerprint(body)!==stored) throw new Error("Challenge registry fingerprint mismatch");

    const registry=new ClaimChallengeRegistry();
    for(const contract of snapshot.contracts??[]){
      const {contractId,...contractBody}=contract;
      const {state,...immutableBody}=contractBody;
      if(fingerprint(immutableBody)!==contractId){
        throw new Error("Challenge contract fingerprint mismatch");
      }
      if(!CLAIM_CHALLENGE_STATES.includes(state)){
        throw new Error("Invalid challenge state");
      }
      registry.#contracts.set(contractId,clone(contract));
    }
    for(const result of snapshot.results??[]){
      if(!verifyFingerprint(result)) throw new Error("Challenge result fingerprint mismatch");
      if(!registry.#contracts.has(result.contractId)){
        throw new Error("Challenge result references unknown contract");
      }
      registry.#results.set(result.contractId,clone(result));
    }
    return registry;
  }
}

export function validateChallengeConstants(){
  const errors=[];
  if(new Set(CLAIM_CHALLENGE_OUTCOMES).size!==CLAIM_CHALLENGE_OUTCOMES.length){
    errors.push("DUPLICATE_CHALLENGE_OUTCOME");
  }
  if(new Set(CLAIM_CHALLENGE_STATES).size!==CLAIM_CHALLENGE_STATES.length){
    errors.push("DUPLICATE_CHALLENGE_STATE");
  }
  return errors;
}
