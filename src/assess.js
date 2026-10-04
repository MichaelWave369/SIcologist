import {CATALOG_VERSION,CONDITION_CATALOG} from "./conditions.js";

const clamp01=v=>{
  const n=Number(v);
  return Number.isFinite(n)?Math.min(1,Math.max(0,n)):0;
};

export function normalizeObservation(observation={}){
  const out={};
  for(const [k,v] of Object.entries(observation)){
    if(typeof v!=="number"||!Number.isFinite(v)) continue;
    out[k]=k==="recoveryDelta"?Math.max(-1,Math.min(1,v)):clamp01(v);
  }
  if(typeof out.confidence==="number"&&typeof out.evidenceStrength==="number"){
    out.confidenceEvidenceGap=Math.max(0,out.confidence-out.evidenceStrength);
  }
  return out;
}

function cmp(a,op,b){
  if(op===">=")return a>=b;
  if(op==="<=")return a<=b;
  if(op===">")return a>b;
  if(op==="<")return a<b;
  if(op==="==")return a===b;
  throw new Error(`Unsupported operator: ${op}`);
}

function evaluate(metrics,condition){
  const rules=condition.rules.map(r=>{
    const observed=Object.hasOwn(metrics,r.metric);
    const actual=observed?metrics[r.metric]:null;
    return {...r,actual,observed,matched:observed?cmp(actual,r.op,r.value):false};
  });
  const observedCount=rules.filter(r=>r.observed).length;
  const matchedCount=rules.filter(r=>r.matched).length;
  const evaluable=observedCount===rules.length;
  const confidence=evaluable&&rules.length?matchedCount/rules.length:0;
  return {...condition,evaluable,active:evaluable&&confidence===1,confidence,rules};
}

function deltas(metrics,baseline={}){
  const out={};
  for(const [k,v] of Object.entries(metrics)){
    if(typeof baseline[k]==="number"&&Number.isFinite(baseline[k])){
      out[k]=Number((v-baseline[k]).toFixed(6));
    }
  }
  return out;
}

const rank={critical:3,warning:2,info:1};

export function assessObservation(observation={},baseline={},catalog=CONDITION_CATALOG){
  const metrics=normalizeObservation(observation);
  const conditions=catalog.map(c=>evaluate(metrics,c));
  const findings=conditions
    .filter(f=>f.active)
    .sort((a,b)=>(rank[b.severity]??0)-(rank[a.severity]??0)||a.id.localeCompare(b.id));
  const unevaluable=conditions
    .filter(f=>!f.evaluable)
    .map(f=>({id:f.id,key:f.key,missingMetrics:f.rules.filter(r=>!r.observed).map(r=>r.metric)}));

  return {
    catalogVersion:CATALOG_VERSION,
    metrics,
    baselineDeltas:deltas(metrics,baseline),
    conditions,
    findings,
    unevaluable,
    status:findings.length?"DEVIATION_DETECTED":"NO_DECLARED_DEVIATION"
  };
}
