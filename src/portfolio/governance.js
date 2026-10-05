import {fingerprint} from "../experiment/fingerprint.js";
import {verifyResearchPortfolio} from "./engine.js";
import {
  PORTFOLIO_GOVERNANCE_VERSION,
  GOVERNANCE_REVIEW_FLAGS,
  normalizePortfolioGovernancePolicy
} from "./governance-policy.js";

function clone(value){ return structuredClone(value); }
function round(value){ return Number(value.toFixed(9)); }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function portfolioParts(portfolio,programId,allocationId){
  if(!verifyResearchPortfolio(portfolio)){
    throw new Error("Research portfolio fingerprint mismatch");
  }
  const program=portfolio.programs.find(item=>item.programId===programId);
  if(!program) throw new Error("Program is not present in portfolio");
  const allocation=portfolio.allocation.allocations.find(item=>
    item.programId===programId&&item.allocationId===allocationId
  );
  if(!allocation) throw new Error("Allocation is not present in portfolio");
  return {program,allocation};
}

function verifyPortfolioSelectionReceipt(portfolio,receipt){
  if(receipt?.version!=="PORTFOLIO_SELECTION_RECEIPT_V0.1"||!verifyFingerprint(receipt)){
    throw new Error("Portfolio selection receipt fingerprint mismatch");
  }
  if(receipt.portfolioFingerprint!==portfolio.fingerprint){
    throw new Error("Portfolio selection receipt belongs to another portfolio");
  }
  if(receipt.campaignSelectionAuthorized!==true||receipt.experimentExecutionAuthorized!==false){
    throw new Error("Portfolio selection receipt authority boundary is invalid");
  }
}

function verifyCampaignSelection(selection){
  if(selection?.version!=="RESEARCH_CAMPAIGN_SELECTION_V0.1"||!verifyFingerprint(selection)){
    throw new Error("Campaign selection fingerprint mismatch");
  }
  if(selection.executionAuthorized!==false){
    throw new Error("Campaign selection unexpectedly authorizes execution");
  }
}

function assessmentSnapshot(assessment){
  return {
    fingerprint:assessment.fingerprint,
    claimId:assessment.claimId,
    claimKey:assessment.claimKey,
    revision:assessment.revision,
    status:assessment.status,
    evidenceGrade:assessment.evidenceGrade,
    strongestReplicationGrade:assessment.strongestReplicationGrade
  };
}

function rate(count,total){
  return total?round(count/total):0;
}

export class PortfolioGovernanceRegistry{
  #policy;
  #selections=new Map();
  #outcomes=new Map();

  constructor({policy={}}={}){
    this.#policy=normalizePortfolioGovernancePolicy(policy);
  }

  registerSelection({
    portfolio,
    portfolioSelectionReceipt,
    campaignSelection
  }){
    verifyPortfolioSelectionReceipt(portfolio,portfolioSelectionReceipt);
    verifyCampaignSelection(campaignSelection);

    const {program,allocation}=portfolioParts(
      portfolio,
      portfolioSelectionReceipt.programId,
      portfolioSelectionReceipt.allocationId
    );

    if(portfolioSelectionReceipt.recommendedStepId!==allocation.recommendedStepId){
      throw new Error("Portfolio selection receipt step mismatch");
    }
    if(campaignSelection.planFingerprint!==program.planFingerprint){
      throw new Error("Campaign selection plan does not match portfolio program");
    }
    if(campaignSelection.stepId!==allocation.recommendedStepId){
      throw new Error("Campaign selection does not match allocated step");
    }

    const uniquenessKey=portfolio.fingerprint+":"+allocation.allocationId;
    if([...this.#selections.values()].some(item=>item.uniquenessKey===uniquenessKey)){
      throw new Error("DUPLICATE_PORTFOLIO_ALLOCATION_SELECTION");
    }

    const body={
      version:"PORTFOLIO_GOVERNANCE_SELECTION_V0.1",
      uniquenessKey,
      portfolioFingerprint:portfolio.fingerprint,
      policyFingerprint:fingerprint(portfolio.policy),
      programId:program.programId,
      programFingerprint:program.fingerprint,
      allocationId:allocation.allocationId,
      allocationRank:allocation.rank,
      allocatedPriorityScore:allocation.priorityScore,
      allocatedEstimatedCost:allocation.recommendedEstimatedCost,
      recommendedStepId:allocation.recommendedStepId,
      recommendedProbeId:allocation.recommendedProbeId,
      targetClaimId:program.targetClaimId,
      targetClaimKey:program.targetClaimKey,
      targetRevision:program.targetRevision,
      beforeAssessment:{
        fingerprint:program.currentAssessmentFingerprint,
        status:program.currentClaimStatus,
        evidenceGrade:program.currentEvidenceGrade,
        strongestReplicationGrade:program.strongestReplicationGrade
      },
      portfolioSelectionReceiptFingerprint:portfolioSelectionReceipt.fingerprint,
      campaignSelectionFingerprint:campaignSelection.fingerprint,
      challengeContractId:campaignSelection.challengeContractId,
      outcomeRecorded:false,
      executionAuthorized:false
    };
    const record={...body,fingerprint:fingerprint(body)};
    this.#selections.set(record.fingerprint,record);
    return clone(record);
  }

  recordOutcome(claimRegistry,challengeRegistry,selectionFingerprint){
    const selection=this.#selections.get(selectionFingerprint);
    if(!selection) throw new Error("Unknown governance selection");
    if([...this.#outcomes.values()].some(item=>item.selectionFingerprint===selectionFingerprint)){
      throw new Error("PORTFOLIO_OUTCOME_ALREADY_RECORDED");
    }

    const result=challengeRegistry.result(selection.challengeContractId);
    if(!result) throw new Error("Selected campaign challenge is unresolved");
    if(!verifyFingerprint(result)) throw new Error("Challenge result fingerprint mismatch");

    const attached=claimRegistry
      .evidenceFor(result.targetClaimId)
      .some(item=>
        item.evidenceType==="CLAIM_CHALLENGE_RESULT"&&
        item.artifactFingerprint===result.fingerprint
      );
    if(!attached){
      throw new Error("Challenge result is not attached to the claim evidence graph");
    }

    const latest=claimRegistry.latest(selection.targetClaimKey);
    if(!latest) throw new Error("Current target claim is unavailable");
    const after=claimRegistry.assessClaim(latest.claimId);
    if(!verifyFingerprint(after)) throw new Error("Current claim assessment fingerprint mismatch");

    const body={
      version:"PORTFOLIO_GOVERNANCE_OUTCOME_V0.1",
      selectionFingerprint,
      portfolioFingerprint:selection.portfolioFingerprint,
      policyFingerprint:selection.policyFingerprint,
      programId:selection.programId,
      allocationId:selection.allocationId,
      allocationRank:selection.allocationRank,
      allocatedPriorityScore:selection.allocatedPriorityScore,
      allocatedEstimatedCost:selection.allocatedEstimatedCost,
      recommendedProbeId:selection.recommendedProbeId,
      challengeContractId:selection.challengeContractId,
      challengeResultFingerprint:result.fingerprint,
      challengeOutcome:result.outcome,
      decisionYield:result.outcome==="INCONCLUSIVE"?"INCONCLUSIVE":"DECISIVE",
      evidenceAttached:true,
      claimTransition:{
        before:clone(selection.beforeAssessment),
        after:assessmentSnapshot(after),
        targetRevisionChanged:after.claimId!==selection.targetClaimId
      },
      boundaries:{
        allocationEffectCausality:"NOT_ESTABLISHED",
        priorityPolicyValidated:false,
        scientificTruth:"NOT_ESTABLISHED"
      }
    };
    const record={...body,fingerprint:fingerprint(body)};
    this.#outcomes.set(record.fingerprint,record);
    return clone(record);
  }

  selections(){
    return [...this.#selections.values()]
      .map(clone)
      .sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
  }

  outcomes(){
    return [...this.#outcomes.values()]
      .map(clone)
      .sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
  }

  summary(){
    const selections=this.selections();
    const outcomes=this.outcomes();
    const completedSelections=new Set(outcomes.map(item=>item.selectionFingerprint));
    const pending=selections.filter(item=>!completedSelections.has(item.fingerprint));

    const outcomeCounts={
      SURVIVED_CHALLENGE:0,
      WEAKENED:0,
      CONTRADICTED:0,
      INCONCLUSIVE:0
    };
    for(const outcome of outcomes){
      if(Object.prototype.hasOwnProperty.call(outcomeCounts,outcome.challengeOutcome)){
        outcomeCounts[outcome.challengeOutcome]+=1;
      }
    }

    const completed=outcomes.length;
    const decisive=
      outcomeCounts.SURVIVED_CHALLENGE+
      outcomeCounts.WEAKENED+
      outcomeCounts.CONTRADICTED;

    const body={
      version:PORTFOLIO_GOVERNANCE_VERSION,
      policy:clone(this.#policy),
      selectionCount:selections.length,
      completedOutcomeCount:completed,
      pendingOutcomeCount:pending.length,
      completionRate:rate(completed,selections.length),
      decisiveOutcomeCount:decisive,
      decisiveRate:rate(decisive,completed),
      inconclusiveRate:rate(outcomeCounts.INCONCLUSIVE,completed),
      contradictionRate:rate(outcomeCounts.CONTRADICTED,completed),
      outcomeCounts,
      uniquePortfolioCount:new Set(selections.map(item=>item.portfolioFingerprint)).size,
      uniquePolicyCount:new Set(selections.map(item=>item.policyFingerprint)).size,
      uniqueProgramCount:new Set(selections.map(item=>item.programId)).size,
      allocatedEstimatedCost:round(selections.reduce((sum,item)=>sum+item.allocatedEstimatedCost,0)),
      completedEstimatedCost:round(outcomes.reduce((sum,item)=>sum+item.allocatedEstimatedCost,0)),
      pendingSelections:pending.map(item=>({
        selectionFingerprint:item.fingerprint,
        portfolioFingerprint:item.portfolioFingerprint,
        programId:item.programId,
        allocationId:item.allocationId,
        challengeContractId:item.challengeContractId
      })),
      evidenceBoundary:{
        outcomesAreDescriptive:true,
        allocationEffectCausality:"NOT_ESTABLISHED",
        priorityPolicyValidated:false
      }
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  governanceReview(){
    const summary=this.summary();
    const flags=[];

    if(summary.pendingOutcomeCount>0){
      flags.push({
        flag:"PENDING_OUTCOMES_PRESENT",
        severity:"INFO",
        value:summary.pendingOutcomeCount
      });
    }

    if(summary.completedOutcomeCount>=this.#policy.minCompletedForRateReview){
      if(summary.inconclusiveRate>this.#policy.maxInconclusiveRate){
        flags.push({
          flag:"HIGH_INCONCLUSIVE_RATE",
          severity:"REVIEW",
          value:summary.inconclusiveRate,
          threshold:this.#policy.maxInconclusiveRate
        });
      }
      if(summary.contradictionRate>this.#policy.maxContradictionRate){
        flags.push({
          flag:"HIGH_CONTRADICTION_RATE",
          severity:"REVIEW",
          value:summary.contradictionRate,
          threshold:this.#policy.maxContradictionRate
        });
      }
    }

    for(const item of flags){
      if(!GOVERNANCE_REVIEW_FLAGS.includes(item.flag)){
        throw new Error("Unknown governance review flag");
      }
    }

    const reviewRequired=flags.some(item=>item.severity==="REVIEW");
    const body={
      version:"PORTFOLIO_GOVERNANCE_REVIEW_V0.1",
      summaryFingerprint:summary.fingerprint,
      flags,
      reviewStatus:reviewRequired?"HUMAN_POLICY_REVIEW_REQUIRED":"NO_AUTOMATIC_POLICY_CHANGE",
      automaticWeightUpdate:false,
      automaticBudgetUpdate:false,
      automaticExecutionChange:false,
      policyRecommendation:"DESCRIPTIVE_REVIEW_ONLY",
      boundaries:{
        correlationIsNotPolicyCausation:true,
        completedOutcomesDoNotValidateWeights:true,
        humanApprovalRequiredForAnyPolicyRevision:true
      }
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  export(){
    const body={
      version:"PORTFOLIO_GOVERNANCE_REGISTRY_V0.1",
      policy:clone(this.#policy),
      selections:this.selections(),
      outcomes:this.outcomes()
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="PORTFOLIO_GOVERNANCE_REGISTRY_V0.1"){
      throw new TypeError("Unsupported portfolio governance registry version");
    }
    const {fingerprint:stored,...body}=snapshot;
    if(fingerprint(body)!==stored) throw new Error("Portfolio governance registry fingerprint mismatch");

    const registry=new PortfolioGovernanceRegistry({policy:snapshot.policy});
    for(const selection of snapshot.selections??[]){
      if(!verifyFingerprint(selection)) throw new Error("Governance selection fingerprint mismatch");
      registry.#selections.set(selection.fingerprint,clone(selection));
    }
    for(const outcome of snapshot.outcomes??[]){
      if(!verifyFingerprint(outcome)) throw new Error("Governance outcome fingerprint mismatch");
      if(!registry.#selections.has(outcome.selectionFingerprint)){
        throw new Error("Governance outcome references unknown selection");
      }
      registry.#outcomes.set(outcome.fingerprint,clone(outcome));
    }
    return registry;
  }
}
