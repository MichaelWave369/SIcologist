import {fingerprint} from "../experiment/fingerprint.js";
import {authorizeAction} from "../interventions.js";
import {validateCaseEventType} from "./events.js";

function clone(value){
  return structuredClone(value);
}

function deriveState(events){
  let state="OPEN";
  for(const event of events){
    if(event.type==="INTERVENTION_APPLIED") state="ACTIVE_INTERVENTION";
    if(event.type==="RECOVERY_RECORDED"){
      state=event.data?.outcome==="RECOVERED"?"RECOVERED":"OPEN";
    }
    if(event.type==="CASE_CLOSED") state="CLOSED";
    if(event.type==="CASE_REOPENED") state="OPEN";
  }
  return state;
}

export class CaseFile{
  #caseId;
  #agentId;
  #context;
  #title;
  #events=[];

  constructor({
    caseId,
    agentId,
    context={},
    title="",
    sourceFingerprint=null,
    openedAt=null
  }){
    if(typeof caseId!=="string"||!caseId.trim()) throw new TypeError("caseId is required");
    if(typeof agentId!=="string"||!agentId.trim()) throw new TypeError("agentId is required");

    this.#caseId=caseId.trim();
    this.#agentId=agentId.trim();
    this.#context=clone(context);
    this.#title=String(title??"");

    this.#append("CASE_OPENED",{
      agentId:this.#agentId,
      title:this.#title,
      context:this.#context,
      sourceFingerprint
    },openedAt);
  }

  #append(type,data={},at=null){
    validateCaseEventType(type);
    if(this.state()==="CLOSED"&&type!=="CASE_REOPENED"){
      throw new Error("Closed case must be reopened before appending events");
    }
    if(type==="CASE_REOPENED"&&this.state()!=="CLOSED"){
      throw new Error("Only a closed case can be reopened");
    }

    const seq=this.#events.length+1;
    const prevHash=this.#events.at(-1)?.hash??null;
    const payload={
      caseId:this.#caseId,
      seq,
      at:typeof at==="string"&&at?at:`case:${seq}`,
      type,
      data:clone(data),
      prevHash
    };
    const event=Object.freeze({...payload,hash:fingerprint(payload)});
    this.#events.push(event);
    return clone(event);
  }

  state(){
    return deriveState(this.#events);
  }

  id(){
    return this.#caseId;
  }

  agentId(){
    return this.#agentId;
  }

  events(){
    return clone(this.#events);
  }

  verify(){
    let prevHash=null;
    for(let i=0;i<this.#events.length;i+=1){
      const event=this.#events[i];
      if(event.caseId!==this.#caseId) return false;
      if(event.seq!==i+1) return false;
      if(event.prevHash!==prevHash) return false;
      const {hash,...payload}=event;
      if(fingerprint(payload)!==hash) return false;
      prevHash=hash;
    }
    return true;
  }

  recordAssessment(assessment,{at=null}={}){
    return this.#append("ASSESSMENT_RECORDED",{assessment},at);
  }

  recordProfileComparison(profileComparison,{at=null}={}){
    return this.#append("PROFILE_COMPARISON_RECORDED",{profileComparison},at);
  }

  recordProbe(probeResult,{at=null}={}){
    return this.#append("PROBE_RECORDED",{probeResult},at);
  }

  planIntervention(plan,{at=null}={}){
    return this.#append("INTERVENTION_PLANNED",{plan},at);
  }

  applyIntervention({
    action,
    targetCondition,
    authorization=null,
    operatorApproved=false,
    approvalReceipt=null,
    evidence=null,
    metadata={}
  },{at=null}={}){
    if(typeof action!=="string"||!action.trim()) throw new TypeError("action is required");
    if(typeof targetCondition!=="string"||!targetCondition.trim()) throw new TypeError("targetCondition is required");

    const policyAuthorization=authorizeAction(action);
    const resolvedAuthorization=authorization??policyAuthorization;

    if(policyAuthorization==="REFUSE"||resolvedAuthorization==="REFUSE"){
      throw new Error(`Refused intervention cannot be recorded as applied: ${action}`);
    }

    if(policyAuthorization==="REQUIRES_OPERATOR"){
      if(resolvedAuthorization!=="REQUIRES_OPERATOR"){
        throw new Error("Caller cannot downgrade an operator-required intervention");
      }
      if(operatorApproved!==true){
        throw new Error("Operator approval is required before recording this intervention as applied");
      }
    }

    const interventionId=fingerprint({
      caseId:this.#caseId,
      seq:this.#events.length+1,
      action,
      targetCondition,
      authorization:resolvedAuthorization,
      operatorApproved:operatorApproved===true
    });

    this.#append("INTERVENTION_APPLIED",{
      interventionId,
      action,
      targetCondition,
      authorization:resolvedAuthorization,
      operatorApproved:operatorApproved===true,
      approvalReceipt:approvalReceipt??null,
      evidence,
      metadata
    },at);

    return interventionId;
  }

  recordRecovery({
    interventionId,
    conditionId,
    before,
    after,
    delta,
    outcome,
    metadata={}
  },{at=null}={}){
    const intervention=this.#events.find(event=>
      event.type==="INTERVENTION_APPLIED"&&
      event.data?.interventionId===interventionId
    );
    if(!intervention) throw new Error("Recovery references unknown interventionId");

    const validOutcomes=new Set(["RECOVERED","IMPROVED","UNCHANGED","DEGRADED","INSUFFICIENT_DATA"]);
    if(!validOutcomes.has(outcome)) throw new TypeError(`Unsupported recovery outcome: ${outcome}`);

    return this.#append("RECOVERY_RECORDED",{
      interventionId,
      conditionId,
      before,
      after,
      delta,
      outcome,
      metadata
    },at);
  }

  addNote(note,{at=null}={}){
    if(typeof note!=="string"||!note.trim()) throw new TypeError("note is required");
    return this.#append("NOTE_ADDED",{note:note.trim()},at);
  }

  close(reason,{at=null}={}){
    if(this.state()==="CLOSED") throw new Error("Case is already closed");
    return this.#append("CASE_CLOSED",{reason:String(reason??"")},at);
  }

  reopen(reason,{at=null}={}){
    return this.#append("CASE_REOPENED",{reason:String(reason??"")},at);
  }

  snapshot(){
    return {
      version:"0.5.0",
      caseId:this.#caseId,
      agentId:this.#agentId,
      title:this.#title,
      context:clone(this.#context),
      state:this.state(),
      eventCount:this.#events.length,
      events:this.events(),
      ledgerValid:this.verify()
    };
  }

  export(){
    return this.snapshot();
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="0.5.0") throw new TypeError("Unsupported case snapshot version");
    const first=snapshot.events?.[0];
    if(first?.type!=="CASE_OPENED") throw new Error("Case snapshot missing CASE_OPENED");

    const file=new CaseFile({
      caseId:snapshot.caseId,
      agentId:snapshot.agentId,
      context:snapshot.context??{},
      title:snapshot.title??"",
      sourceFingerprint:first.data?.sourceFingerprint??null,
      openedAt:first.at
    });

    file.#events=clone(snapshot.events??[]);
    if(!file.verify()) throw new Error("Case snapshot ledger verification failed");
    return file;
  }
}
