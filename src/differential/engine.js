import {fingerprint} from "../experiment/fingerprint.js";
import {
  DIFFERENTIAL_CALIBRATION,
  DIFFERENTIAL_MODEL_VERSION,
  getDifferentialSpec
} from "./catalog.js";
import {
  bayesUpdate,
  entropy,
  normalizeWeights,
  rankProbesByInformationGain
} from "./math.js";

function applyPriors(spec,priors={}){
  const supplied=Object.keys(priors).length>0;
  const rows=spec.hypotheses.map(hypothesis=>({
    id:hypothesis.id,
    label:hypothesis.label,
    priorWeight:
      typeof priors[hypothesis.id]==="number"
        ? priors[hypothesis.id]
        : hypothesis.priorWeight,
    weight:
      typeof priors[hypothesis.id]==="number"
        ? priors[hypothesis.id]
        : hypothesis.priorWeight,
    predictions:hypothesis.predictions
  }));
  const normalized=normalizeWeights(rows);
  return {
    supplied,
    hypotheses:normalized.map(item=>({
      ...item,
      priorWeight:Number(item.weight.toFixed(9)),
      weight:Number(item.weight.toFixed(9))
    }))
  };
}

function ranked(hypotheses){
  return [...hypotheses]
    .sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id))
    .map((h,index)=>({
      rank:index+1,
      hypothesisId:h.id,
      label:h.label,
      priorWeight:h.priorWeight,
      posteriorWeight:Number(h.weight.toFixed(9))
    }));
}

function statusFor(ranking,evidenceCount){
  if(!evidenceCount||!ranking.length) return "HYPOTHESES_OPEN";
  const first=ranking[0]?.posteriorWeight??0;
  const second=ranking[1]?.posteriorWeight??0;
  if(first>=.75&&(first-second)>=.25) return "LEADING_HYPOTHESIS";
  return "HYPOTHESES_OPEN";
}

export class DifferentialHypothesisEngine{
  #spec;
  #hypotheses;
  #evidence=[];
  #priorSource;

  constructor({
    conditionId,
    priors={},
    priorSource="UNIFORM_DEFAULT"
  }){
    const spec=getDifferentialSpec(conditionId);
    if(!spec) throw new TypeError(`Unknown conditionId: ${conditionId}`);
    const prepared=applyPriors(spec,priors);
    this.#spec=spec;
    this.#hypotheses=prepared.hypotheses;
    this.#priorSource=prepared.supplied?priorSource:"UNIFORM_DEFAULT";
  }

  static fromAssessment(assessment,conditionId=null,options={}){
    const finding=conditionId
      ? assessment?.findings?.find(item=>item.id===conditionId)
      : assessment?.findings?.[0];
    if(!finding) throw new Error("No active condition finding available for differential reasoning");
    return new DifferentialHypothesisEngine({
      conditionId:finding.id,
      ...options
    });
  }

  recommendProbe({includeObserved=false}={}){
    const observed=new Set(this.#evidence.map(item=>item.probeId));
    const candidateIds=this.#spec.probes
      .map(item=>item.probeId)
      .filter(probeId=>includeObserved||!observed.has(probeId));

    const ranking=rankProbesByInformationGain(this.#hypotheses,candidateIds);
    if(!ranking.length){
      return {
        status:"NO_UNUSED_PROBE",
        recommendation:null,
        ranking:[]
      };
    }

    const best=ranking[0];
    const probe=this.#spec.probes.find(item=>item.probeId===best.probeId);
    return {
      status:"PROBE_RECOMMENDED",
      recommendation:{
        ...best,
        positiveCriterion:probe?.positiveCriterion??null
      },
      ranking:ranking.map(item=>({
        ...item,
        positiveCriterion:this.#spec.probes.find(p=>p.probeId===item.probeId)?.positiveCriterion??null
      }))
    };
  }

  observe({
    probeId,
    outcome,
    reliability=1,
    source="EXTERNAL_ADAPTER",
    detail=null
  }){
    if(!this.#spec.probes.some(item=>item.probeId===probeId)){
      throw new TypeError(`Probe ${probeId} is not declared for ${this.#spec.conditionId}`);
    }
    if(!["POSITIVE","NEGATIVE","INCONCLUSIVE"].includes(outcome)){
      throw new TypeError(`Unsupported evidence outcome: ${outcome}`);
    }
    if(typeof reliability!=="number"||!Number.isFinite(reliability)||reliability<0||reliability>1){
      throw new TypeError("reliability must be in [0,1]");
    }

    const before=ranked(this.#hypotheses);
    const next=bayesUpdate(this.#hypotheses,{probeId,outcome,reliability});
    this.#hypotheses=next.map(item=>({
      ...item,
      weight:Number(item.weight.toFixed(9))
    }));
    const after=ranked(this.#hypotheses);

    const eventBody={
      seq:this.#evidence.length+1,
      probeId,
      outcome,
      reliability,
      source,
      detail,
      before,
      after
    };
    const event={
      ...eventBody,
      evidenceId:fingerprint(eventBody)
    };
    this.#evidence.push(event);
    return structuredClone(event);
  }

  snapshot(){
    const ranking=ranked(this.#hypotheses);
    const probeRecommendation=this.recommendProbe();
    const body={
      version:"0.6.0",
      conditionId:this.#spec.conditionId,
      conditionKey:this.#spec.conditionKey,
      evidenceModel:DIFFERENTIAL_MODEL_VERSION,
      calibration:DIFFERENTIAL_CALIBRATION,
      priorSource:this.#priorSource,
      explanationStatus:"NOT_ESTABLISHED",
      differentialStatus:statusFor(ranking,this.#evidence.length),
      entropy:entropy(this.#hypotheses.map(h=>h.weight)),
      evidenceCount:this.#evidence.length,
      ranking,
      evidence:structuredClone(this.#evidence),
      recommendedProbe:probeRecommendation.recommendation,
      probeRanking:probeRecommendation.ranking
    };
    return {
      ...body,
      fingerprint:fingerprint(body)
    };
  }
}
