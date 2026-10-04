function safeWeight(value){
  return typeof value==="number"&&Number.isFinite(value)&&value>=0?value:0;
}

export function normalizeWeights(items){
  const total=items.reduce((sum,item)=>sum+safeWeight(item.weight),0);
  if(total<=0){
    const equal=items.length?1/items.length:0;
    return items.map(item=>({...item,weight:equal}));
  }
  return items.map(item=>({...item,weight:safeWeight(item.weight)/total}));
}

export function entropy(weights){
  let value=0;
  for(const p of weights){
    if(typeof p!=="number"||p<=0) continue;
    value-=p*Math.log2(p);
  }
  return Number(value.toFixed(9));
}

function temperedProbability(p,reliability){
  const r=Math.max(0,Math.min(1,reliability));
  return .5+(p-.5)*r;
}

export function bayesUpdate(hypotheses,{
  probeId,
  outcome,
  reliability=1
}){
  if(!["POSITIVE","NEGATIVE","INCONCLUSIVE"].includes(outcome)){
    throw new TypeError(`Unsupported evidence outcome: ${outcome}`);
  }

  if(outcome==="INCONCLUSIVE"){
    return hypotheses.map(h=>({...h}));
  }

  const weighted=hypotheses.map(hypothesis=>{
    const p=hypothesis.predictions?.[probeId]?.pPositive;
    if(typeof p!=="number") throw new Error(`Missing prediction for ${hypothesis.id} / ${probeId}`);
    const effective=temperedProbability(p,reliability);
    const likelihood=outcome==="POSITIVE"?effective:1-effective;
    return {
      ...hypothesis,
      weight:hypothesis.weight*likelihood,
      lastLikelihood:Number(likelihood.toFixed(9))
    };
  });

  return normalizeWeights(weighted);
}

function posteriorForOutcome(hypotheses,probeId,outcome){
  return bayesUpdate(hypotheses,{probeId,outcome,reliability:1});
}

export function probeInformationGain(hypotheses,probeId){
  const normalized=normalizeWeights(hypotheses);
  const currentEntropy=entropy(normalized.map(h=>h.weight));

  let pPositive=0;
  for(const h of normalized){
    const p=h.predictions?.[probeId]?.pPositive;
    if(typeof p!=="number") throw new Error(`Missing prediction for ${h.id} / ${probeId}`);
    pPositive+=h.weight*p;
  }

  const positive=posteriorForOutcome(normalized,probeId,"POSITIVE");
  const negative=posteriorForOutcome(normalized,probeId,"NEGATIVE");
  const positiveEntropy=entropy(positive.map(h=>h.weight));
  const negativeEntropy=entropy(negative.map(h=>h.weight));
  const expectedEntropy=pPositive*positiveEntropy+(1-pPositive)*negativeEntropy;
  const gain=currentEntropy-expectedEntropy;

  return {
    probeId,
    currentEntropy,
    pPositive:Number(pPositive.toFixed(9)),
    positiveEntropy,
    negativeEntropy,
    expectedEntropy:Number(expectedEntropy.toFixed(9)),
    informationGain:Number(gain.toFixed(9))
  };
}

export function rankProbesByInformationGain(hypotheses,probeIds){
  return [...new Set(probeIds)]
    .map(probeId=>probeInformationGain(hypotheses,probeId))
    .sort((a,b)=>b.informationGain-a.informationGain||a.probeId.localeCompare(b.probeId))
    .map((item,index)=>({rank:index+1,...item}));
}
