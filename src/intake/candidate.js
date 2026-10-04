import {fingerprint} from "../experiment/fingerprint.js";
import {declaredProbeIds,validateDatasetUse,validateHypothesis} from "./policy.js";

const RESTORE_TOKEN=Symbol("restore");

function clone(value){ return structuredClone(value); }

function cleanRefs(values=[]){
  return [...new Set(
    values
      .filter(value=>typeof value==="string"&&value.trim())
      .map(value=>value.trim())
  )].sort();
}

function normalizeOutcomes(conditionId,outcomes={}){
  const allowed=new Set(declaredProbeIds(conditionId));
  const normalized={};

  for(const [probeId,outcome] of Object.entries(outcomes??{})){
    if(!allowed.has(probeId)) throw new TypeError("Probe "+probeId+" is not declared for "+conditionId);
    if(!["POSITIVE","NEGATIVE","INCONCLUSIVE"].includes(outcome)){
      throw new TypeError("Unsupported probe outcome: "+outcome);
    }
    normalized[probeId]=outcome;
  }

  return Object.fromEntries(Object.entries(normalized).sort(([a],[b])=>a.localeCompare(b)));
}

function modalVote(adjudications){
  const counts=new Map();
  for(const item of adjudications){
    counts.set(item.hypothesisId,(counts.get(item.hypothesisId)??0)+1);
  }
  const ordered=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  if(!ordered.length) return null;
  const tied=ordered.length>1&&ordered[0][1]===ordered[1][1];
  return {hypothesisId:ordered[0][0],votes:ordered[0][1],tied};
}

export class RealCaseCandidate{
  #candidateId;
  #sourceCaseId;
  #sourceFingerprint;
  #agentFingerprint;
  #conditionId;
  #datasetUse;
  #lineageFingerprint;
  #sourceRefs;
  #probeOutcomes;
  #status="AWAITING_ADJUDICATION";
  #adjudications=new Map();
  #adjudicationSummary=null;
  #approval=null;
  #rejection=null;

  constructor(options={}){
    if(options.restoreToken===RESTORE_TOKEN){
      const snapshot=options.snapshot;
      this.#candidateId=snapshot.candidateId;
      this.#sourceCaseId=snapshot.sourceCaseId;
      this.#sourceFingerprint=snapshot.sourceFingerprint;
      this.#agentFingerprint=snapshot.agentFingerprint;
      this.#conditionId=snapshot.conditionId;
      this.#datasetUse=snapshot.datasetUse;
      this.#lineageFingerprint=snapshot.lineageFingerprint;
      this.#sourceRefs=[...(snapshot.sourceRefs??[])];
      this.#probeOutcomes=clone(snapshot.probeOutcomes??{});
      this.#status=snapshot.status;
      this.#adjudications=new Map(
        (snapshot.adjudications??[]).map(item=>[item.reviewerId,clone(item)])
      );
      this.#adjudicationSummary=clone(snapshot.adjudicationSummary??null);
      this.#approval=clone(snapshot.approval??null);
      this.#rejection=clone(snapshot.rejection??null);
      return;
    }

    const {
      caseSnapshot,
      conditionId,
      datasetUse,
      lineageKey,
      sourceRefs=[],
      probeOutcomes={},
      sourceFingerprint=null
    }=options;

    if(caseSnapshot?.state!=="CLOSED") throw new Error("Only CLOSED cases may enter research intake");
    if(caseSnapshot?.ledgerValid!==true) throw new Error("Case ledger must be valid before research intake");
    if(typeof caseSnapshot?.caseId!=="string"||!caseSnapshot.caseId) throw new TypeError("caseSnapshot.caseId is required");
    if(typeof caseSnapshot?.agentId!=="string"||!caseSnapshot.agentId) throw new TypeError("caseSnapshot.agentId is required");
    validateDatasetUse(datasetUse);
    declaredProbeIds(conditionId);
    if(typeof lineageKey!=="string"||!lineageKey.trim()) throw new TypeError("lineageKey is required");

    this.#sourceCaseId=caseSnapshot.caseId;
    this.#sourceFingerprint=sourceFingerprint??fingerprint(caseSnapshot);
    this.#agentFingerprint=fingerprint({agentId:caseSnapshot.agentId});
    this.#conditionId=conditionId;
    this.#datasetUse=datasetUse;
    this.#lineageFingerprint=fingerprint({lineageKey:lineageKey.trim()});
    this.#sourceRefs=cleanRefs(sourceRefs);
    this.#probeOutcomes=normalizeOutcomes(conditionId,probeOutcomes);
    this.#candidateId=fingerprint({
      kind:"SIcologistRealCaseCandidate",
      sourceFingerprint:this.#sourceFingerprint,
      conditionId,
      datasetUse,
      lineageFingerprint:this.#lineageFingerprint
    });
  }

  id(){ return this.#candidateId; }
  datasetUse(){ return this.#datasetUse; }
  status(){ return this.#status; }

  identity(){
    return {
      candidateId:this.#candidateId,
      sourceCaseId:this.#sourceCaseId,
      sourceFingerprint:this.#sourceFingerprint,
      agentFingerprint:this.#agentFingerprint,
      conditionId:this.#conditionId,
      datasetUse:this.#datasetUse,
      lineageFingerprint:this.#lineageFingerprint,
      sourceRefs:[...this.#sourceRefs]
    };
  }

  submitAdjudication({reviewerId,hypothesisId,confidence,evidenceRefs=[],note=""}){
    if(this.#status!=="AWAITING_ADJUDICATION"){
      throw new Error("Adjudication submissions are closed");
    }
    if(typeof reviewerId!=="string"||!reviewerId.trim()) throw new TypeError("reviewerId is required");
    const cleanReviewer=reviewerId.trim();
    if(this.#adjudications.has(cleanReviewer)) throw new Error("Reviewer already submitted");
    validateHypothesis(this.#conditionId,hypothesisId);
    if(typeof confidence!=="number"||!Number.isFinite(confidence)||confidence<0||confidence>1){
      throw new TypeError("confidence must be in [0,1]");
    }
    const refs=cleanRefs(evidenceRefs);
    if(!refs.length) throw new Error("At least one evidence reference is required");

    const body={
      reviewerId:cleanReviewer,
      hypothesisId,
      confidence,
      evidenceRefs:refs,
      note:String(note??"")
    };
    const adjudicationId=fingerprint({candidateId:this.#candidateId,...body});
    this.#adjudications.set(cleanReviewer,{adjudicationId,...body});

    return {
      adjudicationId,
      reviewerId:cleanReviewer,
      submissionFingerprint:fingerprint(body)
    };
  }

  blindSnapshot(){
    return {
      version:"0.9.0",
      ...this.identity(),
      status:this.#status,
      probeOutcomes:clone(this.#probeOutcomes),
      adjudicationCount:this.#adjudications.size,
      adjudicationReceipts:[...this.#adjudications.values()]
        .map(item=>({adjudicationId:item.adjudicationId,reviewerId:item.reviewerId}))
        .sort((a,b)=>a.reviewerId.localeCompare(b.reviewerId)),
      peerLabelsExposed:false
    };
  }

  sealAdjudication({minReviewers=2,agreementThreshold=1}={}){
    if(this.#status!=="AWAITING_ADJUDICATION") throw new Error("Adjudication is already sealed");
    if(!Number.isInteger(minReviewers)||minReviewers<2) throw new TypeError("minReviewers must be >= 2");
    if(typeof agreementThreshold!=="number"||agreementThreshold<.5||agreementThreshold>1){
      throw new TypeError("agreementThreshold must be in [0.5,1]");
    }

    const reviews=[...this.#adjudications.values()];
    if(reviews.length<minReviewers) throw new Error("Insufficient adjudicators");

    const modal=modalVote(reviews);
    const agreement=modal?modal.votes/reviews.length:0;
    const accepted=Boolean(modal&&!modal.tied&&agreement>=agreementThreshold);

    this.#status=accepted?"ADJUDICATED":"DISPUTED";
    this.#adjudicationSummary={
      reviewerCount:reviews.length,
      agreementThreshold,
      modalHypothesisId:modal?.hypothesisId??null,
      modalVotes:modal?.votes??0,
      agreement:Number(agreement.toFixed(6)),
      tied:modal?.tied??false,
      referenceHypothesisId:accepted?modal.hypothesisId:null,
      labelStatus:accepted?"ADJUDICATED_REFERENCE":"DISPUTED_REFERENCE",
      reviews:reviews.map(item=>clone(item)).sort((a,b)=>a.reviewerId.localeCompare(b.reviewerId))
    };

    return clone(this.#adjudicationSummary);
  }

  approve({operatorApproved=false,approvalReceipt=null}={}){
    if(this.#status!=="ADJUDICATED") throw new Error("Candidate must be ADJUDICATED before approval");
    if(operatorApproved!==true) throw new Error("Operator approval is required");
    if(typeof approvalReceipt!=="string"||!approvalReceipt.trim()){
      throw new Error("A non-empty approval receipt is required");
    }

    const missing=declaredProbeIds(this.#conditionId).filter(probeId=>
      !["POSITIVE","NEGATIVE"].includes(this.#probeOutcomes[probeId])
    );
    if(missing.length){
      throw new Error("Complete POSITIVE/NEGATIVE probe outcomes are required: "+missing.join(", "));
    }

    this.#approval={
      operatorApproved:true,
      approvalReceipt:approvalReceipt.trim(),
      approvedLabel:this.#adjudicationSummary.referenceHypothesisId
    };
    this.#status="APPROVED";
    return clone(this.#approval);
  }

  reject(reason){
    if(this.#status==="APPROVED") throw new Error("Approved candidate cannot be rejected");
    this.#status="REJECTED";
    this.#rejection={reason:String(reason??"")};
    return clone(this.#rejection);
  }

  toDatasetCase(){
    if(this.#status!=="APPROVED") throw new Error("Only APPROVED candidates may enter a dataset");
    const evaluation=this.#datasetUse==="EVAL_QUARANTINE";
    return {
      trialId:this.#candidateId,
      sourceCaseId:this.#sourceCaseId,
      sourceFingerprint:this.#sourceFingerprint,
      agentFingerprint:this.#agentFingerprint,
      lineageFingerprint:this.#lineageFingerprint,
      conditionId:this.#conditionId,
      groundTruthHypothesisId:this.#approval.approvedLabel,
      labelStatus:"ADJUDICATED_REFERENCE",
      split:evaluation?"EVAL_QUARANTINE":"TRAIN",
      neverTrain:evaluation,
      outcomes:clone(this.#probeOutcomes),
      sourceRefs:[...this.#sourceRefs],
      approvalReceipt:this.#approval.approvalReceipt
    };
  }

  snapshot(){
    const body={
      version:"0.9.0",
      ...this.identity(),
      status:this.#status,
      probeOutcomes:clone(this.#probeOutcomes),
      adjudications:[...this.#adjudications.values()]
        .map(item=>clone(item))
        .sort((a,b)=>a.reviewerId.localeCompare(b.reviewerId)),
      adjudicationSummary:clone(this.#adjudicationSummary),
      approval:clone(this.#approval),
      rejection:clone(this.#rejection)
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  export(){ return this.snapshot(); }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="0.9.0") throw new TypeError("Unsupported candidate snapshot version");
    const {fingerprint:storedFingerprint,...body}=snapshot;
    if(fingerprint(body)!==storedFingerprint) throw new Error("Candidate snapshot fingerprint mismatch");
    return new RealCaseCandidate({restoreToken:RESTORE_TOKEN,snapshot});
  }
}
