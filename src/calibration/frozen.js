import {CONDITION_CATALOG} from "../conditions.js";
import {fingerprint} from "../experiment/fingerprint.js";

export const FROZEN_BENCHMARK_VERSION="SYNTHETIC_FROZEN_V0.1";
export const FROZEN_RECIPE_VERSION="PATTERN_GRID_V0.1";
export const FROZEN_BENCHMARK_FINGERPRINT="27983d6c163aa6cafc29cf70dc82fd9c79a4318c75c6f209dcf9fd84ecab46d2";
export const FROZEN_BENCHMARK_COUNTS=Object.freeze({cases:336,train:224,heldout:112,conditions:12,hypotheses:28});

const PATTERNS=Object.freeze({
  0:Object.freeze([
    Object.freeze([1,1,1,1,1,1,1,0,1,1,1,0]),
    Object.freeze([0,0,1,0,0,1,0,0,0,1,0,0])
  ]),
  1:Object.freeze([
    Object.freeze([0,0,1,0,0,0,1,0,0,0,1,0]),
    Object.freeze([1,1,1,1,1,1,1,0,1,1,1,0])
  ]),
  2:Object.freeze([
    Object.freeze([1,1,1,1,0,1,1,0,1,1,0,0]),
    Object.freeze([0,0,0,1,0,0,0,0,0,0,1,0])
  ])
});

function hypothesisId(conditionId,index){
  return "H-"+conditionId+"-"+String(index+1).padStart(2,"0");
}

export function generateFrozenSyntheticBenchmark(){
  const cases=[];
  for(const condition of CONDITION_CATALOG){
    if(condition.probes.length!==2) throw new Error("Frozen recipe requires exactly two probes for "+condition.id);
    condition.alternatives.forEach((_,hypothesisIndex)=>{
      const pattern=PATTERNS[hypothesisIndex];
      if(!pattern) throw new Error("Frozen recipe has no pattern for hypothesis index "+hypothesisIndex);
      for(let ordinal=0;ordinal<12;ordinal+=1){
        const split=ordinal<8?"TRAIN":"HELDOUT";
        const truth=hypothesisId(condition.id,hypothesisIndex);
        const outcomes=Object.fromEntries(condition.probes.map((probeId,probeIndex)=>[
          probeId,
          pattern[probeIndex][ordinal]?"POSITIVE":"NEGATIVE"
        ]));
        const trialIdentity={conditionId:condition.id,groundTruthHypothesisId:truth,ordinal:ordinal+1,split};
        cases.push({
          trialId:fingerprint(trialIdentity),
          conditionId:condition.id,
          groundTruthHypothesisId:truth,
          split,
          outcomes
        });
      }
    });
  }
  const body={
    version:FROZEN_BENCHMARK_VERSION,
    kind:"SYNTHETIC_FROZEN",
    externalValidity:"NOT_ESTABLISHED",
    recipeVersion:FROZEN_RECIPE_VERSION,
    cases
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function validateFrozenSyntheticBenchmark(dataset){
  const errors=[];
  if(dataset?.version!==FROZEN_BENCHMARK_VERSION) errors.push("VERSION_MISMATCH");
  if(dataset?.kind!=="SYNTHETIC_FROZEN") errors.push("KIND_MISMATCH");
  if(dataset?.externalValidity!=="NOT_ESTABLISHED") errors.push("EXTERNAL_VALIDITY_BOUNDARY_MISSING");
  if(dataset?.recipeVersion!==FROZEN_RECIPE_VERSION) errors.push("RECIPE_MISMATCH");

  const body={
    version:dataset?.version,
    kind:dataset?.kind,
    externalValidity:dataset?.externalValidity,
    recipeVersion:dataset?.recipeVersion,
    cases:dataset?.cases??[]
  };
  if(fingerprint(body)!==dataset?.fingerprint) errors.push("INTERNAL_FINGERPRINT_MISMATCH");
  if(dataset?.fingerprint!==FROZEN_BENCHMARK_FINGERPRINT) errors.push("PINNED_FINGERPRINT_MISMATCH");

  const cases=dataset?.cases??[];
  if(cases.length!==FROZEN_BENCHMARK_COUNTS.cases) errors.push("CASE_COUNT_MISMATCH");
  if(cases.filter(item=>item.split==="TRAIN").length!==FROZEN_BENCHMARK_COUNTS.train) errors.push("TRAIN_COUNT_MISMATCH");
  if(cases.filter(item=>item.split==="HELDOUT").length!==FROZEN_BENCHMARK_COUNTS.heldout) errors.push("HELDOUT_COUNT_MISMATCH");
  if(new Set(cases.map(item=>item.trialId)).size!==cases.length) errors.push("DUPLICATE_TRIAL_ID");

  for(const condition of CONDITION_CATALOG){
    const validHypotheses=new Set(condition.alternatives.map((_,index)=>hypothesisId(condition.id,index)));
    const conditionCases=cases.filter(item=>item.conditionId===condition.id);
    for(const hypothesisIdValue of validHypotheses){
      for(const split of ["TRAIN","HELDOUT"]){
        if(!conditionCases.some(item=>item.groundTruthHypothesisId===hypothesisIdValue&&item.split===split)){
          errors.push("MISSING_"+condition.id+"_"+hypothesisIdValue+"_"+split);
        }
      }
    }
    for(const item of conditionCases){
      if(!validHypotheses.has(item.groundTruthHypothesisId)) errors.push("INVALID_TRUTH_"+item.trialId);
      for(const probeId of condition.probes){
        if(!["POSITIVE","NEGATIVE"].includes(item.outcomes?.[probeId])){
          errors.push("MISSING_OUTCOME_"+item.trialId+"_"+probeId);
        }
      }
    }
  }
  return errors;
}
