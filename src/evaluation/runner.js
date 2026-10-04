import {DifferentialHypothesisEngine} from "../differential/engine.js";
import {getDifferentialSpec} from "../differential/catalog.js";

export function predictEvaluationManifest(manifest,{
  specResolver=getDifferentialSpec,
  source="SEALED_EVALUATION_RUNNER"
}={}){
  if(manifest?.labelsExposed!==false){
    throw new Error("Runner requires a label-hidden evaluation manifest");
  }
  if(!Array.isArray(manifest?.cases)||!manifest.cases.length){
    throw new Error("Evaluation manifest is empty");
  }
  if(typeof specResolver!=="function") throw new TypeError("specResolver is required");

  return manifest.cases.map(item=>{
    const spec=specResolver(item.conditionId);
    if(!spec) throw new Error("No differential spec for "+item.conditionId);

    const engine=new DifferentialHypothesisEngine({
      conditionId:item.conditionId,
      spec
    });

    for(const probe of spec.probes){
      const outcome=item.outcomes?.[probe.probeId];
      if(!["POSITIVE","NEGATIVE"].includes(outcome)){
        throw new Error("Manifest missing outcome for "+probe.probeId);
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
