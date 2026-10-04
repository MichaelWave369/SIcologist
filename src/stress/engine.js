import {fingerprint} from "../experiment/fingerprint.js";
import {getProbeSpec} from "../experiment/probes.js";
import {getDifferentialSpec} from "../differential/catalog.js";
import {normalizeWeights,probeInformationGain} from "../differential/math.js";
import {
  DEFAULT_STRESS_WEIGHTS,
  STRESS_LAB_VERSION,
  invasivenessForProbe,
  resolveProbeCost,
  validateStressWeights
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

function validateClaimScope(claim,conditionId,label){
  const declared=claim?.scope?.conditionId;
  if(declared!==undefined&&declared!==conditionId){
    throw new Error(label+" claim scope condition "+declared+" does not match "+conditionId);
  }
}

function hypothesisById(spec,id,label){
  const found=spec.hypotheses.find(item=>item.id===id);
  if(!found) throw new Error("Unknown "+label+" hypothesisId for "+spec.conditionId+": "+id);
  return found;
}

function preparedPair(target,rival,priors={}){
  const targetWeight=typeof priors.target==="number"?priors.target:target.priorWeight;
  const rivalWeight=typeof priors.rival==="number"?priors.rival:rival.priorWeight;
  for(const [name,value] of Object.entries({target:targetWeight,rival:rivalWeight})){
    if(typeof value!=="number"||!Number.isFinite(value)||value<0){
      throw new TypeError(name+" prior must be a finite number >= 0");
    }
  }
  const normalized=normalizeWeights([
    {...target,weight:targetWeight},
    {...rival,weight:rivalWeight}
  ]);
  return normalized.map(item=>({...item,weight:round(item.weight)}));
}

function decisionForProbe(pTarget,pRival){
  if(pTarget===pRival){
    return {
      positiveFavors:"NEITHER",
      negativeFavors:"NEITHER",
      decisionTable:{
        PROBE_POSITIVE:"INCONCLUSIVE",
        PROBE_NEGATIVE:"INCONCLUSIVE"
      }
    };
  }
  const positiveFavors=pTarget>pRival?"TARGET":"RIVAL";
  const negativeFavors=positiveFavors==="TARGET"?"RIVAL":"TARGET";
  return {
    positiveFavors,
    negativeFavors,
    decisionTable:positiveFavors==="TARGET"
      ?{
        PROBE_POSITIVE:"SURVIVED_CHALLENGE",
        PROBE_NEGATIVE:"CONTRADICTED",
        PROBE_INCONCLUSIVE:"INCONCLUSIVE"
      }
      :{
        PROBE_POSITIVE:"CONTRADICTED",
        PROBE_NEGATIVE:"SURVIVED_CHALLENGE",
        PROBE_INCONCLUSIVE:"INCONCLUSIVE"
      }
  };
}

function candidateScore({
  informationGain,
  discrimination,
  cost,
  invasiveness,
  weights
}){
  return round(
    weights.informationGain*informationGain+
    weights.discrimination*discrimination+
    weights.costEfficiency*(1-cost)+
    weights.lowInvasiveness*(1-invasiveness)
  );
}

export function generateClaimStressReport(claimRegistry,{
  targetClaimId,
  rivalClaimId,
  conditionId,
  targetHypothesisId,
  rivalHypothesisId,
  priors={},
  spec=null,
  weights=DEFAULT_STRESS_WEIGHTS,
  costOverrides={},
  boundaryConditions=[]
}){
  const targetClaim=currentClaim(claimRegistry,targetClaimId,"target");
  const rivalClaim=currentClaim(claimRegistry,rivalClaimId,"rival");
  if(targetClaimId===rivalClaimId) throw new Error("Target and rival claims must differ");
  validateClaimScope(targetClaim,conditionId,"Target");
  validateClaimScope(rivalClaim,conditionId,"Rival");

  const resolvedSpec=spec??getDifferentialSpec(conditionId);
  if(!resolvedSpec) throw new Error("Unknown conditionId: "+conditionId);
  if(resolvedSpec.conditionId!==conditionId){
    throw new Error("Differential spec condition mismatch");
  }

  const targetHypothesis=hypothesisById(resolvedSpec,targetHypothesisId,"target");
  const rivalHypothesis=hypothesisById(resolvedSpec,rivalHypothesisId,"rival");
  if(targetHypothesis.id===rivalHypothesis.id){
    throw new Error("Target and rival hypotheses must differ");
  }

  const resolvedWeights=validateStressWeights(weights);
  const pair=preparedPair(targetHypothesis,rivalHypothesis,priors);
  const boundaries=[...new Set(
    (Array.isArray(boundaryConditions)?boundaryConditions:[])
      .filter(value=>typeof value==="string"&&value.trim())
      .map(value=>value.trim())
  )].sort();

  const candidates=resolvedSpec.probes.map(({probeId,positiveCriterion})=>{
    const probe=getProbeSpec(probeId);
    if(!probe) throw new Error("Probe missing from catalog: "+probeId);
    const targetP=targetHypothesis.predictions?.[probeId]?.pPositive;
    const rivalP=rivalHypothesis.predictions?.[probeId]?.pPositive;
    if(typeof targetP!=="number"||typeof rivalP!=="number"){
      throw new Error("Missing hypothesis likelihood for "+probeId);
    }

    const info=probeInformationGain(pair,probeId);
    const discrimination=round(Math.abs(targetP-rivalP));
    const cost=round(resolveProbeCost(probeId,costOverrides));
    const invasiveness=round(invasivenessForProbe(probe));
    const decision=decisionForProbe(targetP,rivalP);
    const score=candidateScore({
      informationGain:info.informationGain,
      discrimination,
      cost,
      invasiveness,
      weights:resolvedWeights
    });

    const body={
      probeId,
      description:probe.description,
      executionMode:probe.executionMode,
      mutatesPrimary:probe.mutatesPrimary,
      positiveCriterion:positiveCriterion??null,
      predictions:{
        targetPositiveProbability:round(targetP),
        rivalPositiveProbability:round(rivalP),
        positiveFavors:decision.positiveFavors,
        negativeFavors:decision.negativeFavors
      },
      metrics:{
        informationGain:info.informationGain,
        discrimination,
        estimatedCost:cost,
        estimatedInvasiveness:invasiveness,
        stressScore:score
      },
      generatedContract:{
        challengeQuestion:"Does probe "+probeId+" discriminate the target claim from the registered rival within the frozen scope?",
        expectedObservation:decision.positiveFavors==="TARGET"
          ?"A PROBE_POSITIVE observation favors the target over the registered rival under the differential model."
          :"A PROBE_NEGATIVE observation favors the target over the registered rival under the differential model.",
        falsifier:decision.positiveFavors==="TARGET"
          ?"A PROBE_NEGATIVE observation contradicts the target relative to the registered rival under the frozen decision rule."
          :"A PROBE_POSITIVE observation contradicts the target relative to the registered rival under the frozen decision rule.",
        boundaryConditions:boundaries,
        probeId,
        decisionTable:decision.decisionTable
      },
      recommendationOnly:true,
      executionAuthorized:false,
      preregistered:false
    };
    return {...body,candidateId:fingerprint(body)};
  }).sort((a,b)=>
    b.metrics.stressScore-a.metrics.stressScore||
    b.metrics.informationGain-a.metrics.informationGain||
    b.metrics.discrimination-a.metrics.discrimination||
    a.probeId.localeCompare(b.probeId)
  ).map((item,index)=>({rank:index+1,...item}));

  const body={
    version:STRESS_LAB_VERSION,
    target:{
      claimId:targetClaim.claimId,
      claimKey:targetClaim.claimKey,
      revision:targetClaim.revision,
      hypothesisId:targetHypothesis.id,
      hypothesisLabel:targetHypothesis.label
    },
    rival:{
      claimId:rivalClaim.claimId,
      claimKey:rivalClaim.claimKey,
      revision:rivalClaim.revision,
      hypothesisId:rivalHypothesis.id,
      hypothesisLabel:rivalHypothesis.label
    },
    conditionId,
    evidenceModel:resolvedSpec.version??"UNKNOWN",
    calibration:resolvedSpec.calibration??"NOT_DECLARED",
    externalValidity:resolvedSpec.externalValidity??"NOT_DECLARED",
    pairPriors:Object.fromEntries(pair.map(item=>[item.id,item.weight])),
    scoring:{
      weights:clone(resolvedWeights),
      costSource:Object.keys(costOverrides).length?"ENGINEERING_DEFAULTS_WITH_OVERRIDES":"ENGINEERING_DEFAULTS",
      costMeasured:false,
      invasivenessDerivedFromProbeContract:true
    },
    candidates,
    recommendation:candidates[0]??null,
    boundaries:{
      generatorExecutesProbes:false,
      generatorPreregistersAutomatically:false,
      operatorSelectionRequired:true,
      claimTruthEstablished:false
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function preregisterStressCandidate({
  claimRegistry,
  challengeRegistry,
  stressReport,
  candidateId,
  operatorApproved=false,
  approvalReceipt=null,
  preregistrationNote=""
}){
  if(!verifyFingerprint(stressReport)||stressReport.version!==STRESS_LAB_VERSION){
    throw new Error("Stress report fingerprint mismatch");
  }
  if(!challengeRegistry||typeof challengeRegistry.preregister!=="function"){
    throw new TypeError("challengeRegistry with preregister() is required");
  }
  if(operatorApproved!==true) throw new Error("Operator approval is required");
  if(typeof approvalReceipt!=="string"||!approvalReceipt.trim()){
    throw new Error("A non-empty approval receipt is required");
  }

  const target=currentClaim(claimRegistry,stressReport.target.claimId,"target");
  const rival=currentClaim(claimRegistry,stressReport.rival.claimId,"rival");
  if(
    target.revision!==stressReport.target.revision||
    rival.revision!==stressReport.rival.revision
  ){
    throw new Error("Claim revision changed after stress report generation");
  }

  const candidate=stressReport.candidates.find(item=>item.candidateId===candidateId);
  if(!candidate) throw new Error("Candidate is not present in stress report");
  if(
    candidate.generatedContract.decisionTable.PROBE_POSITIVE==="INCONCLUSIVE"&&
    candidate.generatedContract.decisionTable.PROBE_NEGATIVE==="INCONCLUSIVE"
  ){
    throw new Error("Candidate cannot be preregistered because it does not discriminate the claims");
  }

  const contract=challengeRegistry.preregister(claimRegistry,{
    targetClaimId:stressReport.target.claimId,
    rivalClaimId:stressReport.rival.claimId,
    ...clone(candidate.generatedContract),
    preregistrationNote:[
      preregistrationNote,
      "Stress report "+stressReport.fingerprint,
      "Candidate "+candidate.candidateId,
      "Operator receipt "+approvalReceipt.trim()
    ].filter(Boolean).join(" | ")
  });

  return {
    version:"STRESS_SELECTION_RECEIPT_V0.1",
    stressReportFingerprint:stressReport.fingerprint,
    candidateId:candidate.candidateId,
    candidateRank:candidate.rank,
    operatorApproved:true,
    approvalReceipt:approvalReceipt.trim(),
    challengeContractId:contract.contractId,
    executionAuthorized:false,
    fingerprint:fingerprint({
      version:"STRESS_SELECTION_RECEIPT_V0.1",
      stressReportFingerprint:stressReport.fingerprint,
      candidateId:candidate.candidateId,
      candidateRank:candidate.rank,
      operatorApproved:true,
      approvalReceipt:approvalReceipt.trim(),
      challengeContractId:contract.contractId,
      executionAuthorized:false
    })
  };
}
