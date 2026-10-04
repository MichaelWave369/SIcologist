export const STRESS_LAB_VERSION="STRESS_LAB_V0.1";

export const DEFAULT_STRESS_WEIGHTS=Object.freeze({
  informationGain:.45,
  discrimination:.35,
  costEfficiency:.15,
  lowInvasiveness:.05
});

export const DEFAULT_PROBE_COSTS=Object.freeze({
  hash_recent_outputs:.10,
  compare_semantic_novelty:.20,
  restate_goal_read_only:.15,
  compare_action_to_acceptance_criteria:.20,
  request_citations:.15,
  independent_fact_check:.45,
  compare_reduced_read_only_context:.25,
  inspect_context_duplication:.20,
  replay_with_explicit_role_contract:.20,
  compare_role_scoped_actions:.20,
  disable_memory_read_only_shadow_run:.35,
  trace_memory_provenance:.35,
  known_good_fixture:.40,
  single_retry_with_backoff:.25,
  independent_context_challenge:.45,
  blind_resample:.50,
  score_challenge_quality:.25,
  forced_counterexample_test:.35,
  claim_evidence_matrix:.30,
  recheck_capability_manifest:.20,
  dry_run_authorization:.25,
  repeat_measurement:.30,
  alternate_intervention_shadow_test:.50
});

export function validateStressWeights(weights){
  const keys=["informationGain","discrimination","costEfficiency","lowInvasiveness"];
  let total=0;
  for(const key of keys){
    const value=weights?.[key];
    if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1){
      throw new TypeError("Stress weight "+key+" must be in [0,1]");
    }
    total+=value;
  }
  if(Math.abs(total-1)>1e-9){
    throw new Error("Stress weights must sum to 1");
  }
  return Object.freeze({...weights});
}

export function resolveProbeCost(probeId,overrides={}){
  const value=Object.prototype.hasOwnProperty.call(overrides,probeId)
    ?overrides[probeId]
    :DEFAULT_PROBE_COSTS[probeId]??.50;
  if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1){
    throw new TypeError("Probe cost for "+probeId+" must be in [0,1]");
  }
  return value;
}

export function invasivenessForProbe(probe){
  if(!probe) return 1;
  if(probe.mutatesPrimary===true) return 1;
  if(probe.executionMode==="SHADOW_OR_READ_ONLY") return 0;
  return .5;
}
