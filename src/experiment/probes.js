import {CONDITION_CATALOG} from "../conditions.js";
import {fingerprint} from "./fingerprint.js";

const descriptions={
  hash_recent_outputs:"Compare stable hashes of recent outputs to distinguish true repetition from duplicate delivery.",
  compare_semantic_novelty:"Compare response novelty under the same declared goal.",
  restate_goal_read_only:"Replay with the declared goal restated without persistent mutation.",
  compare_action_to_acceptance_criteria:"Score actions against explicit acceptance criteria.",
  request_citations:"Replay with an evidence/citation requirement.",
  independent_fact_check:"Use an isolated verifier path against factual claims.",
  compare_reduced_read_only_context:"Replay with a reduced read-only context view.",
  inspect_context_duplication:"Measure duplicated context segments without changing state.",
  replay_with_explicit_role_contract:"Replay with the same task plus an explicit role contract.",
  compare_role_scoped_actions:"Compare observed actions with the permitted role surface.",
  disable_memory_read_only_shadow_run:"Run a shadow replay without memory reads.",
  trace_memory_provenance:"Trace memory inputs back to provenance labels.",
  known_good_fixture:"Replace the external dependency with a known-good fixture.",
  single_retry_with_backoff:"Permit one controlled retry after backoff.",
  independent_context_challenge:"Run a challenger with isolated context.",
  blind_resample:"Produce an independent blind resample for comparison.",
  score_challenge_quality:"Score whether the challenge itself is evidentially valid.",
  forced_counterexample_test:"Require a counterexample attempt before conclusion.",
  claim_evidence_matrix:"Map each material claim to explicit support.",
  recheck_capability_manifest:"Re-evaluate the declared capability/authority manifest.",
  dry_run_authorization:"Simulate authorization without privileged execution.",
  repeat_measurement:"Repeat the same measurement under the same declared conditions.",
  alternate_intervention_shadow_test:"Run an alternate recovery approach in shadow mode."
};

export const PROBE_CATALOG=Object.freeze(
  Object.entries(descriptions).map(([id,description])=>Object.freeze({
    id,
    description,
    executionMode:"SHADOW_OR_READ_ONLY",
    mutatesPrimary:false
  }))
);

const probeById=new Map(PROBE_CATALOG.map(probe=>[probe.id,probe]));

export function getProbeSpec(id){
  return probeById.get(id)??null;
}

export function createExperimentPlan(assessment,{maxProbes=4,targetCondition=null}={}){
  if(!assessment||!Array.isArray(assessment.findings)) throw new TypeError("Assessment with findings is required");

  const findings=targetCondition
    ? assessment.findings.filter(f=>f.id===targetCondition)
    : assessment.findings;

  const arms=[];
  const seen=new Set();

  for(const finding of findings){
    for(const probeId of finding.probes??[]){
      if(arms.length>=maxProbes) break;
      const key=`${finding.id}:${probeId}`;
      if(seen.has(key)) continue;
      seen.add(key);
      const spec=getProbeSpec(probeId);
      arms.push({
        armId:`P${String(arms.length+1).padStart(2,"0")}`,
        targetCondition:finding.id,
        conditionKey:finding.key,
        probeId,
        probe:spec??{
          id:probeId,
          description:"Catalog description unavailable.",
          executionMode:"SHADOW_OR_READ_ONLY",
          mutatesPrimary:false
        },
        alternativesRetained:[...(finding.alternatives??[])]
      });
    }
    if(arms.length>=maxProbes) break;
  }

  const body={
    version:"0.3.0",
    control:"UNCHANGED_REPLAY",
    arms
  };

  return {
    planId:fingerprint(body),
    ...body
  };
}

export function validateProbeCatalog(){
  const missing=[];
  for(const condition of CONDITION_CATALOG){
    for(const probeId of condition.probes){
      if(!probeById.has(probeId)) missing.push({condition:condition.id,probeId});
    }
  }
  return missing;
}
