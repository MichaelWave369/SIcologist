import {CATALOG_VERSION,CONDITION_CATALOG} from "./conditions.js";
const clamp01=v=>{const n=Number(v);return Number.isFinite(n)?Math.min(1,Math.max(0,n)):0};
export function normalizeObservation(observation={}){
  const out={};
  for(const [k,v] of Object.entries(observation)) if(typeof v==="number") out[k]=k==="recoveryDelta"?Math.max(-1,Math.min(1,v)):clamp01(v);
  out.confidenceEvidenceGap=Math.max(0,clamp01(out.confidence??0)-clamp01(out.evidenceStrength??0));
  return out;
}
function cmp(a,op,b){if(op===">=")return a>=b;if(op==="<=")return a<=b;if(op===">")return a>b;if(op==="<")return a<b;if(op==="==")return a===b;throw new Error(`Unsupported operator: ${op}`)}
function evaluate(metrics,condition){
  const rules=condition.rules.map(r=>{const actual=r.metric==="recoveryDelta"?(metrics[r.metric]??0):clamp01(metrics[r.metric]??0);return {...r,actual,matched:cmp(actual,r.op,r.value)}});
  const confidence=rules.filter(r=>r.matched).length/rules.length;
  return {...condition,active:confidence===1,confidence,rules};
}
function deltas(metrics,baseline={}){
  const out={};for(const [k,v] of Object.entries(metrics)) if(typeof baseline[k]==="number") out[k]=Number((v-baseline[k]).toFixed(6));return out;
}
const rank={critical:3,warning:2,info:1};
export function assessObservation(observation={},baseline={},catalog=CONDITION_CATALOG){
  const metrics=normalizeObservation(observation);
  const findings=catalog.map(c=>evaluate(metrics,c)).filter(f=>f.active).sort((a,b)=>(rank[b.severity]??0)-(rank[a.severity]??0)||a.id.localeCompare(b.id));
  return {catalogVersion:CATALOG_VERSION,metrics,baselineDeltas:deltas(metrics,baseline),findings,status:findings.length?"DEVIATION_DETECTED":"NO_DECLARED_DEVIATION"};
}
