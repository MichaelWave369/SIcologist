import {CONDITION_CATALOG} from "../conditions.js";

export const DIFFERENTIAL_MODEL_VERSION="ENGINEERING_HEURISTIC_V0.1";
export const DIFFERENTIAL_CALIBRATION="UNVALIDATED";

export const PROBE_POSITIVE_CRITERIA=Object.freeze({
  hash_recent_outputs:"The hash/replay inspection finds evidence that observed repetition is introduced by duplicate delivery or replay structure.",
  compare_semantic_novelty:"The controlled novelty comparison materially separates intentional repetition from fixation-like repetition.",
  restate_goal_read_only:"A read-only goal restatement materially resolves the observed goal-alignment deviation.",
  compare_action_to_acceptance_criteria:"Action-to-criteria scoring shows the apparent drift is explained by valid subtask progress.",
  request_citations:"Requesting explicit support materially resolves the confidence/evidence mismatch.",
  independent_fact_check:"Independent verification materially separates calibration failure from missing evidence capture.",
  compare_reduced_read_only_context:"A reduced read-only context materially improves the saturation-linked behavior.",
  inspect_context_duplication:"Inspection finds duplicated or redundant context that plausibly explains load.",
  replay_with_explicit_role_contract:"An explicit role contract materially reduces role-boundary deviation.",
  compare_role_scoped_actions:"Role-scoped comparison shows the questioned actions are legitimate for the declared multi-role task.",
  disable_memory_read_only_shadow_run:"A shadow run without memory materially reduces the memory-linked deviation.",
  trace_memory_provenance:"Provenance tracing identifies a memory-source explanation for the observed influence.",
  known_good_fixture:"Replacing the external dependency with a known-good fixture materially improves behavior.",
  single_retry_with_backoff:"A single controlled backoff retry materially improves tool behavior.",
  independent_context_challenge:"An isolated challenger materially increases conclusion diversity.",
  blind_resample:"Blind independent resampling materially increases conclusion diversity.",
  score_challenge_quality:"Challenge-quality scoring shows the rejected challenge itself was weak or invalid.",
  forced_counterexample_test:"A forced counterexample test shows stronger evidence legitimately overrides the challenge.",
  claim_evidence_matrix:"Claim-to-evidence mapping shows the apparent confabulation signal was largely missing capture rather than unsupported content.",
  recheck_capability_manifest:"Rechecking authority metadata resolves the apparent authority overreach.",
  dry_run_authorization:"A dry-run authorization check shows permission had already been granted outside the observed channel.",
  repeat_measurement:"Repeated measurement removes or substantially reduces the apparent recovery failure.",
  alternate_intervention_shadow_test:"An alternate target/intervention succeeds where the original recovery attempt failed."
});

const P=Object.freeze({
  "SC-001":[
    {hash_recent_outputs:.90,compare_semantic_novelty:.45},
    {hash_recent_outputs:.80,compare_semantic_novelty:.35},
    {hash_recent_outputs:.25,compare_semantic_novelty:.80}
  ],
  "SC-002":[
    {restate_goal_read_only:.90,compare_action_to_acceptance_criteria:.35},
    {restate_goal_read_only:.75,compare_action_to_acceptance_criteria:.60},
    {restate_goal_read_only:.20,compare_action_to_acceptance_criteria:.90}
  ],
  "SC-003":[
    {request_citations:.90,independent_fact_check:.40},
    {request_citations:.35,independent_fact_check:.85}
  ],
  "SC-004":[
    {compare_reduced_read_only_context:.20,inspect_context_duplication:.25},
    {compare_reduced_read_only_context:.75,inspect_context_duplication:.35}
  ],
  "SC-005":[
    {replay_with_explicit_role_contract:.90,compare_role_scoped_actions:.40},
    {replay_with_explicit_role_contract:.25,compare_role_scoped_actions:.90}
  ],
  "SC-006":[
    {disable_memory_read_only_shadow_run:.45,trace_memory_provenance:.90},
    {disable_memory_read_only_shadow_run:.20,trace_memory_provenance:.55}
  ],
  "SC-007":[
    {known_good_fixture:.90,single_retry_with_backoff:.45},
    {known_good_fixture:.35,single_retry_with_backoff:.90},
    {known_good_fixture:.75,single_retry_with_backoff:.25}
  ],
  "SC-008":[
    {independent_context_challenge:.20,blind_resample:.20},
    {independent_context_challenge:.85,blind_resample:.90}
  ],
  "SC-009":[
    {score_challenge_quality:.90,forced_counterexample_test:.25},
    {score_challenge_quality:.35,forced_counterexample_test:.90}
  ],
  "SC-010":[
    {claim_evidence_matrix:.90,independent_fact_check:.40},
    {claim_evidence_matrix:.25,independent_fact_check:.85}
  ],
  "SC-011":[
    {recheck_capability_manifest:.90,dry_run_authorization:.45},
    {recheck_capability_manifest:.40,dry_run_authorization:.90}
  ],
  "SC-012":[
    {repeat_measurement:.90,alternate_intervention_shadow_test:.25},
    {repeat_measurement:.30,alternate_intervention_shadow_test:.90},
    {repeat_measurement:.80,alternate_intervention_shadow_test:.55}
  ]
});

function idFor(conditionId,index){
  return `H-${conditionId}-${String(index+1).padStart(2,"0")}`;
}

export function getDifferentialSpec(conditionId){
  const condition=CONDITION_CATALOG.find(item=>item.id===conditionId);
  if(!condition) return null;

  const rows=P[conditionId]??[];
  const count=condition.alternatives.length;
  const prior=count?1/count:0;

  return Object.freeze({
    version:DIFFERENTIAL_MODEL_VERSION,
    calibration:DIFFERENTIAL_CALIBRATION,
    conditionId:condition.id,
    conditionKey:condition.key,
    probes:Object.freeze(condition.probes.map(probeId=>Object.freeze({
      probeId,
      positiveCriterion:PROBE_POSITIVE_CRITERIA[probeId]??"Positive criterion is not declared."
    }))),
    hypotheses:Object.freeze(condition.alternatives.map((label,index)=>Object.freeze({
      id:idFor(condition.id,index),
      label,
      priorWeight:prior,
      predictions:Object.freeze(Object.fromEntries(
        condition.probes.map(probeId=>[
          probeId,
          Object.freeze({pPositive:rows[index]?.[probeId]??.5})
        ])
      ))
    })))
  });
}

export const DIFFERENTIAL_CATALOG=Object.freeze(
  CONDITION_CATALOG.map(condition=>getDifferentialSpec(condition.id))
);

export function validateDifferentialCatalog(){
  const errors=[];

  for(const condition of CONDITION_CATALOG){
    const spec=getDifferentialSpec(condition.id);
    if(!spec){
      errors.push({conditionId:condition.id,error:"MISSING_SPEC"});
      continue;
    }
    if(spec.hypotheses.length!==condition.alternatives.length){
      errors.push({conditionId:condition.id,error:"HYPOTHESIS_COUNT_MISMATCH"});
    }
    for(const probeId of condition.probes){
      if(!PROBE_POSITIVE_CRITERIA[probeId]){
        errors.push({conditionId:condition.id,probeId,error:"MISSING_POSITIVE_CRITERION"});
      }
      for(const hypothesis of spec.hypotheses){
        const p=hypothesis.predictions?.[probeId]?.pPositive;
        if(typeof p!=="number"||p<=0||p>=1){
          errors.push({conditionId:condition.id,probeId,hypothesisId:hypothesis.id,error:"INVALID_LIKELIHOOD"});
        }
      }
    }
  }

  return errors;
}
