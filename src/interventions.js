const OPERATOR_REQUIRED=new Set(["clear_working_context","switch_model","disable_tool","modify_persistent_memory","change_authority_grants"]);
const REFUSED=new Set(["covert_human_manipulation","bypass_authorization"]);
export function authorizeAction(action){if(REFUSED.has(action))return "REFUSE";if(OPERATOR_REQUIRED.has(action))return "REQUIRES_OPERATOR";return "AUTO_ALLOWED"}
export function planIntervention(assessment){
  const f=assessment?.findings?.[0];
  if(!f)return {status:"NO_ACTION",targetCondition:null,probe:null,action:null,authorization:"AUTO_ALLOWED",alternativesRetained:[]};
  const action=f.interventions[0]??null;
  return {status:"PLAN_READY",targetCondition:f.id,probe:f.probes[0]??null,action,authorization:action?authorizeAction(action):"AUTO_ALLOWED",alternativesRetained:[...f.alternatives]};
}
