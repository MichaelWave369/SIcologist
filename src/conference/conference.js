import {fingerprint} from "../experiment/fingerprint.js";
import {aggregateConferenceReviews,compareConferenceRounds} from "./math.js";
import {CASE_CONFERENCE_ROLES,validateConferenceRole} from "./roles.js";

function clone(value){
  return structuredClone(value);
}

function cleanRefs(values=[]){
  return [...new Set(values.filter(value=>typeof value==="string"&&value.trim()).map(value=>value.trim()))].sort();
}

function validateDifferential(differential,conditionId){
  if(!differential||typeof differential!=="object") throw new TypeError("differential is required");
  if(differential.conditionId!==conditionId){
    throw new Error(`Differential condition ${differential.conditionId} does not match conference condition ${conditionId}`);
  }
  if(!Array.isArray(differential.ranking)||!differential.ranking.length){
    throw new TypeError("differential.ranking is required");
  }
}

export class CaseConference{
  #conferenceId;
  #caseId;
  #agentId;
  #conditionId;
  #requiredRoles;
  #minReviews;
  #phase="BLIND";
  #blind=new Map();
  #revisions=new Map();
  #blindAggregate=null;
  #finalReport=null;

  constructor({
    conferenceId=null,
    caseId,
    agentId,
    conditionId,
    requiredRoles=CASE_CONFERENCE_ROLES,
    minReviews=2
  }){
    if(typeof caseId!=="string"||!caseId.trim()) throw new TypeError("caseId is required");
    if(typeof agentId!=="string"||!agentId.trim()) throw new TypeError("agentId is required");
    if(typeof conditionId!=="string"||!conditionId.trim()) throw new TypeError("conditionId is required");
    if(!Array.isArray(requiredRoles)||!requiredRoles.length) throw new TypeError("requiredRoles must be a non-empty array");
    for(const role of requiredRoles) validateConferenceRole(role);
    if(new Set(requiredRoles).size!==requiredRoles.length) throw new TypeError("requiredRoles must be unique");
    if(!Number.isInteger(minReviews)||minReviews<2) throw new TypeError("minReviews must be an integer >= 2");

    this.#caseId=caseId.trim();
    this.#agentId=agentId.trim();
    this.#conditionId=conditionId.trim();
    this.#requiredRoles=[...requiredRoles];
    this.#minReviews=minReviews;
    this.#conferenceId=conferenceId??fingerprint({
      kind:"SIcologistCaseConference",
      caseId:this.#caseId,
      agentId:this.#agentId,
      conditionId:this.#conditionId,
      requiredRoles:this.#requiredRoles,
      minReviews
    });
  }

  id(){ return this.#conferenceId; }
  phase(){ return this.#phase; }

  #missingRoles(){
    const present=new Set([...this.#blind.values()].map(review=>review.role));
    return this.#requiredRoles.filter(role=>!present.has(role));
  }

  submitBlind({
    reviewerId,
    role,
    differential,
    evidenceRefs=[],
    note=""
  }){
    if(this.#phase!=="BLIND") throw new Error("Blind submissions are closed");
    if(typeof reviewerId!=="string"||!reviewerId.trim()) throw new TypeError("reviewerId is required");
    const id=reviewerId.trim();
    validateConferenceRole(role);
    if(!this.#requiredRoles.includes(role)) throw new Error(`Role ${role} is not required by this conference`);
    if(this.#blind.has(id)) throw new Error(`Reviewer ${id} already submitted`);
    if([...this.#blind.values()].some(review=>review.role===role)){
      throw new Error(`Role ${role} already has a blind submission`);
    }
    validateDifferential(differential,this.#conditionId);

    const body={
      reviewerId:id,
      role,
      differential:clone(differential),
      evidenceRefs:cleanRefs(evidenceRefs),
      note:String(note??"")
    };
    const reviewId=fingerprint({
      conferenceId:this.#conferenceId,
      phase:"BLIND",
      ...body
    });
    const stored={reviewId,...body};
    this.#blind.set(id,stored);

    return {
      reviewId,
      reviewerId:id,
      role,
      submissionFingerprint:fingerprint(body)
    };
  }

  blindSnapshot(){
    return {
      version:"0.7.0",
      conferenceId:this.#conferenceId,
      caseId:this.#caseId,
      agentId:this.#agentId,
      conditionId:this.#conditionId,
      phase:this.#phase,
      requiredRoles:[...this.#requiredRoles],
      minReviews:this.#minReviews,
      submissionCount:this.#blind.size,
      missingRoles:this.#missingRoles(),
      receipts:[...this.#blind.values()]
        .map(review=>({
          reviewId:review.reviewId,
          reviewerId:review.reviewerId,
          role:review.role
        }))
        .sort((a,b)=>a.role.localeCompare(b.role)),
      blindContentExposed:false
    };
  }

  sealBlind({allowIncomplete=false}={}){
    if(this.#phase!=="BLIND") throw new Error("Blind round is already sealed");
    if(this.#blind.size<this.#minReviews){
      throw new Error(`Conference requires at least ${this.#minReviews} blind reviews`);
    }
    const missing=this.#missingRoles();
    if(missing.length&&!allowIncomplete){
      throw new Error(`Missing required roles: ${missing.join(", ")}`);
    }

    const reviews=[...this.#blind.values()].map(clone);
    this.#blindAggregate=aggregateConferenceReviews(reviews);
    this.#phase="REVIEW";

    return this.reviewSnapshot();
  }

  submitRevision({
    reviewerId,
    differential,
    evidenceRefs=[],
    note=""
  }){
    if(this.#phase!=="REVIEW") throw new Error("Revisions are only accepted during REVIEW phase");
    if(typeof reviewerId!=="string"||!reviewerId.trim()) throw new TypeError("reviewerId is required");
    const id=reviewerId.trim();
    const original=this.#blind.get(id);
    if(!original) throw new Error("Only original blind reviewers may submit revisions");
    if(this.#revisions.has(id)) throw new Error(`Reviewer ${id} already submitted a revision`);
    validateDifferential(differential,this.#conditionId);

    const body={
      reviewerId:id,
      role:original.role,
      differential:clone(differential),
      evidenceRefs:cleanRefs(evidenceRefs),
      note:String(note??"")
    };
    const revisionId=fingerprint({
      conferenceId:this.#conferenceId,
      phase:"REVIEW",
      ...body
    });
    this.#revisions.set(id,{revisionId,...body});

    return {
      revisionId,
      reviewerId:id,
      role:original.role,
      submissionFingerprint:fingerprint(body)
    };
  }

  reviewSnapshot(){
    if(this.#phase==="BLIND") throw new Error("Blind round must be sealed first");

    return {
      version:"0.7.0",
      conferenceId:this.#conferenceId,
      caseId:this.#caseId,
      agentId:this.#agentId,
      conditionId:this.#conditionId,
      phase:this.#phase,
      requiredRoles:[...this.#requiredRoles],
      blindAggregate:clone(this.#blindAggregate),
      blindReviews:[...this.#blind.values()].map(clone).sort((a,b)=>a.role.localeCompare(b.role)),
      revisionCount:this.#revisions.size,
      revisionReceipts:[...this.#revisions.values()]
        .map(item=>({revisionId:item.revisionId,reviewerId:item.reviewerId,role:item.role}))
        .sort((a,b)=>a.role.localeCompare(b.role)),
      epistemicStatus:"CONSENSUS_IS_NOT_TRUTH"
    };
  }

  close(){
    if(this.#phase!=="REVIEW") throw new Error("Conference must be in REVIEW phase to close");

    const finalReviews=[...this.#blind.values()].map(original=>{
      return clone(this.#revisions.get(original.reviewerId)??original);
    });
    const finalAggregate=aggregateConferenceReviews(finalReviews);
    const comparison=compareConferenceRounds(this.#blindAggregate,finalAggregate);

    const body={
      version:"0.7.0",
      conferenceId:this.#conferenceId,
      caseId:this.#caseId,
      agentId:this.#agentId,
      conditionId:this.#conditionId,
      phase:"CLOSED",
      requiredRoles:[...this.#requiredRoles],
      blindReviewCount:this.#blind.size,
      revisionCount:this.#revisions.size,
      blindAggregate:clone(this.#blindAggregate),
      finalAggregate,
      roundComparison:comparison,
      finalReviews,
      epistemicStatus:"CONSENSUS_IS_NOT_TRUTH",
      explanationStatus:"NOT_ESTABLISHED"
    };

    this.#finalReport={
      ...body,
      fingerprint:fingerprint(body)
    };
    this.#phase="CLOSED";
    return clone(this.#finalReport);
  }

  snapshot(){
    if(this.#phase==="BLIND") return this.blindSnapshot();
    if(this.#phase==="REVIEW") return this.reviewSnapshot();
    return clone(this.#finalReport);
  }
}
