import {fingerprint} from "../experiment/fingerprint.js";
import {generateClaimStressReport,preregisterStressCandidate} from "../stress/engine.js";
import {
  CAMPAIGN_GATE_DECISIONS,
  CAMPAIGN_VERSION,
  normalizeCampaignPolicy
} from "./policy.js";

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function currentClaim(claimRegistry,claimId,label){
  if(!claimRegistry||typeof claimRegistry.claim!=="function"){
    throw new TypeError("claimRegistry with claim() is required");
  }
  const claim=claimRegistry.claim(claimId);
  if(!claim) throw new Error("Unknown "+label+" claimId");
  if(claim.supersededBy) throw new Error(label+" claim revision is superseded");
  return claim;
}

function cleanBindings(rivals){
  if(!Array.isArray(rivals)||!rivals.length) throw new TypeError("rivals must be a non-empty array");
  return rivals.map((item,index)=>{
    for(const key of ["rivalClaimId","conditionId","targetHypothesisId","rivalHypothesisId"]){
      if(typeof item?.[key]!=="string"||!item[key].trim()){
        throw new TypeError("rivals["+index+"]."+key+" is required");
      }
    }
    return {
      rivalClaimId:item.rivalClaimId.trim(),
      conditionId:item.conditionId.trim(),
      targetHypothesisId:item.targetHypothesisId.trim(),
      rivalHypothesisId:item.rivalHypothesisId.trim(),
      priors:clone(item.priors??{}),
      costOverrides:clone(item.costOverrides??{}),
      weights:item.weights?clone(item.weights):undefined,
      boundaryConditions:Array.isArray(item.boundaryConditions)?[...item.boundaryConditions]:[]
    };
  });
}

function sortCandidates(items){
  return [...items].sort((a,b)=>
    b.candidate.metrics.stressScore-a.candidate.metrics.stressScore||
    b.candidate.metrics.informationGain-a.candidate.metrics.informationGain||
    b.candidate.metrics.discrimination-a.candidate.metrics.discrimination||
    a.candidate.candidateId.localeCompare(b.candidate.candidateId)
  );
}

function pairCandidateKey(report,candidate){
  return report.fingerprint+":"+candidate.candidateId;
}

function buildSelectionPool(stressReports){
  const topByRival=sortCandidates(
    stressReports.map(report=>({
      stressReport:report,
      candidate:report.recommendation
    }))
  );
  const topKeys=new Set(topByRival.map(item=>pairCandidateKey(item.stressReport,item.candidate)));
  const remainder=sortCandidates(
    stressReports.flatMap(report=>
      report.candidates
        .filter(candidate=>!topKeys.has(pairCandidateKey(report,candidate)))
        .map(candidate=>({stressReport:report,candidate}))
    )
  );
  return [...topByRival,...remainder];
}

export function verifyResearchCampaignPlan(plan){
  return Boolean(plan?.version===CAMPAIGN_VERSION&&verifyFingerprint(plan));
}

export function createResearchCampaignPlan(claimRegistry,{
  targetClaimId,
  rivals,
  policy={},
  title=""
}){
  const target=currentClaim(claimRegistry,targetClaimId,"target");
  const assessment=claimRegistry.assessClaim(targetClaimId);
  if(!verifyFingerprint(assessment)) throw new Error("Target claim assessment fingerprint mismatch");

  const resolvedPolicy=normalizeCampaignPolicy(policy);
  const bindings=cleanBindings(rivals);
  const rivalIds=new Set();

  const stressReports=bindings.map(binding=>{
    if(binding.rivalClaimId===targetClaimId) throw new Error("Target and rival claims must differ");
    if(rivalIds.has(binding.rivalClaimId)) throw new Error("Duplicate rivalClaimId");
    rivalIds.add(binding.rivalClaimId);
    currentClaim(claimRegistry,binding.rivalClaimId,"rival");

    return generateClaimStressReport(claimRegistry,{
      targetClaimId,
      rivalClaimId:binding.rivalClaimId,
      conditionId:binding.conditionId,
      targetHypothesisId:binding.targetHypothesisId,
      rivalHypothesisId:binding.rivalHypothesisId,
      priors:binding.priors,
      costOverrides:binding.costOverrides,
      weights:binding.weights,
      boundaryConditions:binding.boundaryConditions
    });
  });

  const pool=buildSelectionPool(stressReports);
  const steps=[];
  let totalCost=0;
  const selectedCandidateKeys=new Set();

  for(const item of pool){
    if(steps.length>=resolvedPolicy.maxSteps) break;
    const selectionKey=pairCandidateKey(item.stressReport,item.candidate);
    if(selectedCandidateKeys.has(selectionKey)) continue;
    const nextCost=round(totalCost+item.candidate.metrics.estimatedCost);
    if(nextCost-resolvedPolicy.maxEstimatedCost>1e-9) continue;

    const stepBody={
      stepNumber:steps.length+1,
      stressReportFingerprint:item.stressReport.fingerprint,
      candidateId:item.candidate.candidateId,
      candidateRank:item.candidate.rank,
      rivalClaimId:item.stressReport.rival.claimId,
      rivalClaimKey:item.stressReport.rival.claimKey,
      rivalRevision:item.stressReport.rival.revision,
      probeId:item.candidate.probeId,
      estimatedCost:item.candidate.metrics.estimatedCost,
      stressScore:item.candidate.metrics.stressScore,
      informationGain:item.candidate.metrics.informationGain,
      discrimination:item.candidate.metrics.discrimination,
      executionAuthorized:false,
      operatorSelectionRequired:true,
      checkpointRequiredAfterCompletion:true
    };
    const step={...stepBody,stepId:fingerprint(stepBody)};
    steps.push(step);
    selectedCandidateKeys.add(selectionKey);
    totalCost=nextCost;
  }

  const covered=new Set(steps.map(step=>step.rivalClaimId));
  const body={
    version:CAMPAIGN_VERSION,
    title:typeof title==="string"?title.trim():"",
    target:{
      claimId:target.claimId,
      claimKey:target.claimKey,
      revision:target.revision
    },
    initialAssessment:assessment,
    policy:clone(resolvedPolicy),
    selectionStrategy:resolvedPolicy.selectionStrategy,
    stressReports:stressReports.map(clone).sort((a,b)=>a.rival.claimId.localeCompare(b.rival.claimId)),
    steps,
    planning:{
      rivalCount:stressReports.length,
      rivalsCovered:covered.size,
      rivalsOmitted:stressReports
        .filter(report=>!covered.has(report.rival.claimId))
        .map(report=>report.rival.claimId)
        .sort(),
      plannedStepCount:steps.length,
      plannedEstimatedCost:round(totalCost),
      candidatePoolCount:pool.length
    },
    stopRules:{
      challengeContradicted:resolvedPolicy.stopOnChallengeContradiction?"STOP":"CONTINUE_WITH_REVIEW",
      targetSuperseded:"STOP",
      rivalSuperseded:"STOP_PLAN_STALE",
      contestedClaim:resolvedPolicy.escalateOnContestedClaim?"ESCALATE":"CONTINUE",
      unresolvedChallenge:"WAIT",
      unresolvedEvidenceAttachment:"WAIT",
      planExhausted:"STOP"
    },
    boundaries:{
      planExecutesNothing:true,
      planPreregistersNothing:true,
      eachStepNeedsOperatorSelection:true,
      eachStepNeedsCheckpoint:true,
      scientificTruth:"NOT_ESTABLISHED"
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export class ResearchCampaignTracker{
  #plan;
  #selections=[];

  constructor(plan){
    if(!verifyResearchCampaignPlan(plan)) throw new Error("Research campaign plan fingerprint mismatch");
    this.#plan=clone(plan);
  }

  plan(){ return clone(this.#plan); }

  selections(){
    return this.#selections.map(clone);
  }

  #completedRecord(claimRegistry,challengeRegistry,selection){
    const summary=challengeRegistry.summary(selection.challengeContractId);
    const result=challengeRegistry.result(selection.challengeContractId);
    if(summary.state!=="RESOLVED"||!result){
      return {state:"ACTIVE",summary,result:null,attached:false};
    }
    const attached=claimRegistry
      .evidenceFor(this.#plan.target.claimId)
      .some(item=>
        item.evidenceType==="CLAIM_CHALLENGE_RESULT"&&
        item.artifactFingerprint===result.fingerprint
      );
    return {state:"RESOLVED",summary,result,attached};
  }

  gate(claimRegistry,challengeRegistry){
    const target=claimRegistry.claim(this.#plan.target.claimId);
    if(!target||target.supersededBy){
      return this.#gate("STOP_TARGET_SUPERSEDED",null,{
        reason:"Target claim revision is no longer current."
      });
    }
    if(target.revision!==this.#plan.target.revision){
      return this.#gate("STOP_TARGET_SUPERSEDED",null,{
        reason:"Target claim revision changed."
      });
    }

    const assessment=claimRegistry.assessClaim(target.claimId);
    const lastSelection=this.#selections.at(-1)??null;

    if(lastSelection){
      const record=this.#completedRecord(claimRegistry,challengeRegistry,lastSelection);
      if(record.state==="ACTIVE"){
        return this.#gate("WAIT_CHALLENGE_RESULT",assessment,{
          activeStepNumber:lastSelection.stepNumber,
          challengeContractId:lastSelection.challengeContractId
        });
      }
      if(!record.attached){
        return this.#gate("WAIT_RESULT_ATTACHMENT",assessment,{
          activeStepNumber:lastSelection.stepNumber,
          challengeContractId:lastSelection.challengeContractId,
          resultFingerprint:record.result.fingerprint
        });
      }
      if(
        this.#plan.policy.stopOnChallengeContradiction&&
        record.result.outcome==="CONTRADICTED"
      ){
        return this.#gate("STOP_CHALLENGE_CONTRADICTED",assessment,{
          completedStepNumber:lastSelection.stepNumber,
          challengeContractId:lastSelection.challengeContractId,
          resultFingerprint:record.result.fingerprint
        });
      }
    }

    if(
      this.#plan.policy.escalateOnContestedClaim&&
      assessment.status==="CONTESTED"
    ){
      return this.#gate("ESCALATE_CONTESTED",assessment,{
        reason:"Target claim now has both supporting and contradicting evidence."
      });
    }

    const nextStep=this.#plan.steps[this.#selections.length]??null;
    if(!nextStep){
      return this.#gate(
        this.#plan.steps.length?"STOP_PLAN_COMPLETE":"STOP_NO_PLANNED_STEPS",
        assessment,
        {completedSelections:this.#selections.length}
      );
    }

    const nextRival=claimRegistry.claim(nextStep.rivalClaimId);
    if(!nextRival||nextRival.supersededBy||nextRival.revision!==nextStep.rivalRevision){
      return this.#gate("STOP_PLAN_STALE",assessment,{
        reason:"The next planned rival claim revision is no longer current.",
        nextStepNumber:nextStep.stepNumber,
        rivalClaimId:nextStep.rivalClaimId
      });
    }

    return this.#gate("READY_FOR_OPERATOR_SELECTION",assessment,{
      nextStep:clone(nextStep)
    });
  }

  #gate(decision,assessment,detail){
    if(!CAMPAIGN_GATE_DECISIONS.includes(decision)){
      throw new Error("Unknown campaign gate decision");
    }
    const body={
      version:"RESEARCH_CAMPAIGN_GATE_V0.1",
      planFingerprint:this.#plan.fingerprint,
      decision,
      assessmentFingerprint:assessment?.fingerprint??null,
      selectedStepCount:this.#selections.length,
      detail:clone(detail),
      executionAuthorized:false,
      operatorActionRequired:decision==="READY_FOR_OPERATOR_SELECTION"||decision==="ESCALATE_CONTESTED"
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  selectNext({
    claimRegistry,
    challengeRegistry,
    operatorApproved=false,
    approvalReceipt=null,
    preregistrationNote=""
  }){
    const gate=this.gate(claimRegistry,challengeRegistry);
    if(gate.decision!=="READY_FOR_OPERATOR_SELECTION"){
      throw new Error("Campaign gate is not ready for selection: "+gate.decision);
    }

    const step=gate.detail.nextStep;
    const report=this.#plan.stressReports.find(item=>
      item.fingerprint===step.stressReportFingerprint
    );
    if(!report) throw new Error("Campaign step stress report missing");

    const selection=preregisterStressCandidate({
      claimRegistry,
      challengeRegistry,
      stressReport:report,
      candidateId:step.candidateId,
      operatorApproved,
      approvalReceipt,
      preregistrationNote:[
        preregistrationNote,
        "Campaign "+this.#plan.fingerprint,
        "Step "+step.stepNumber
      ].filter(Boolean).join(" | ")
    });

    const body={
      version:"RESEARCH_CAMPAIGN_SELECTION_V0.1",
      planFingerprint:this.#plan.fingerprint,
      stepNumber:step.stepNumber,
      stepId:step.stepId,
      rivalClaimId:step.rivalClaimId,
      estimatedCost:step.estimatedCost,
      stressSelectionReceipt:selection,
      challengeContractId:selection.challengeContractId,
      executionAuthorized:false
    };
    const record={...body,fingerprint:fingerprint(body)};
    this.#selections.push(record);
    return clone(record);
  }

  export(){
    const body={
      version:"RESEARCH_CAMPAIGN_TRACKER_V0.1",
      plan:clone(this.#plan),
      selections:this.selections()
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="RESEARCH_CAMPAIGN_TRACKER_V0.1"){
      throw new TypeError("Unsupported campaign tracker version");
    }
    const {fingerprint:stored,...body}=snapshot;
    if(fingerprint(body)!==stored) throw new Error("Campaign tracker fingerprint mismatch");
    const tracker=new ResearchCampaignTracker(snapshot.plan);
    for(const selection of snapshot.selections??[]){
      if(!verifyFingerprint(selection)) throw new Error("Campaign selection fingerprint mismatch");
      tracker.#selections.push(clone(selection));
    }
    return tracker;
  }
}

export function validateCampaignConstants(){
  const errors=[];
  if(new Set(CAMPAIGN_GATE_DECISIONS).size!==CAMPAIGN_GATE_DECISIONS.length){
    errors.push("DUPLICATE_CAMPAIGN_GATE_DECISION");
  }
  return errors;
}
