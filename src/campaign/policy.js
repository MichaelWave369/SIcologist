export const CAMPAIGN_VERSION="RESEARCH_CAMPAIGN_V0.1";

export const CAMPAIGN_GATE_DECISIONS=Object.freeze([
  "READY_FOR_OPERATOR_SELECTION",
  "WAIT_CHALLENGE_RESULT",
  "WAIT_RESULT_ATTACHMENT",
  "STOP_CHALLENGE_CONTRADICTED",
  "STOP_TARGET_SUPERSEDED",
  "ESCALATE_CONTESTED",
  "STOP_PLAN_COMPLETE",
  "STOP_NO_PLANNED_STEPS"
]);

export const DEFAULT_CAMPAIGN_POLICY=Object.freeze({
  maxSteps:5,
  maxEstimatedCost:2,
  selectionStrategy:"RIVAL_COVERAGE_THEN_GLOBAL_STRESS_SCORE",
  stopOnChallengeContradiction:true,
  escalateOnContestedClaim:true
});

export function normalizeCampaignPolicy(policy={}){
  const resolved={...DEFAULT_CAMPAIGN_POLICY,...policy};
  if(!Number.isInteger(resolved.maxSteps)||resolved.maxSteps<1){
    throw new TypeError("maxSteps must be an integer >= 1");
  }
  if(
    typeof resolved.maxEstimatedCost!=="number"||
    !Number.isFinite(resolved.maxEstimatedCost)||
    resolved.maxEstimatedCost<=0
  ){
    throw new TypeError("maxEstimatedCost must be > 0");
  }
  if(resolved.selectionStrategy!=="RIVAL_COVERAGE_THEN_GLOBAL_STRESS_SCORE"){
    throw new TypeError("Unsupported campaign selectionStrategy");
  }
  if(typeof resolved.stopOnChallengeContradiction!=="boolean"){
    throw new TypeError("stopOnChallengeContradiction must be boolean");
  }
  if(typeof resolved.escalateOnContestedClaim!=="boolean"){
    throw new TypeError("escalateOnContestedClaim must be boolean");
  }
  return Object.freeze({...resolved});
}
