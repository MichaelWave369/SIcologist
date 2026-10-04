import {DifferentialHypothesisEngine} from "../differential/engine.js";
import {getDifferentialSpec} from "../differential/catalog.js";

export function predictIndependentChallenge(challengeBundle,{
  specResolver=getDifferentialSpec,
  source="INDEPENDENT_CHALLENGE_RUNNER"
}={}){
  if(challengeBundle?.version!=="INDEPENDENT_CHALLENGE_V0.1"){
    throw new TypeError("Unsupported challenge bundle");
  }
  if(challengeBundle?.labelsExposed!==false){
    throw new Error("Challenge runner requires labelsExposed=false");
  }
  if(!Array.isArray(challengeBundle?.cases)||!challengeBundle.cases.length){
    throw new Error("Challenge bundle is empty");
  }
  if(typeof specResolver!=="function") throw new TypeError("specResolver is required");

  return challengeBundle.cases.map(item=>{
    const spec=specResolver(item.conditionId);
    if(!spec) throw new Error("No differential spec for "+item.conditionId);
    const engine=new DifferentialHypothesisEngine({
      conditionId:item.conditionId,
      spec
    });

    for(const probe of spec.probes){
      const outcome=item.outcomes?.[probe.probeId];
      if(!["POSITIVE","NEGATIVE"].includes(outcome)){
        throw new Error("Challenge missing outcome for "+probe.probeId);
      }
      engine.observe({
        probeId:probe.probeId,
        outcome,
        reliability:1,
        source
      });
    }

    return {
      trialId:item.trialId,
      conditionId:item.conditionId,
      ranking:engine.snapshot().ranking.map(row=>({
        hypothesisId:row.hypothesisId,
        posteriorWeight:row.posteriorWeight
      }))
    };
  });
}
