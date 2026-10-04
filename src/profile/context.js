import {fingerprint} from "../experiment/fingerprint.js";

const WILDCARD="*";
const FIELDS=["agentId","modelId","role","taskClass","runtime"];

function clean(value){
  if(typeof value!=="string") return WILDCARD;
  const trimmed=value.trim();
  return trimmed||WILDCARD;
}

export function normalizeProfileContext(input={}){
  const context={
    agentId:clean(input.agentId),
    modelId:clean(input.modelId),
    role:clean(input.role),
    taskClass:clean(input.taskClass),
    runtime:clean(input.runtime)
  };
  if(context.agentId===WILDCARD) throw new TypeError("agentId is required for a longitudinal profile");
  return Object.freeze(context);
}

export function profileContextKey(context){
  return fingerprint(normalizeProfileContext(context));
}

export function profileScopes(input={}){
  const c=normalizeProfileContext(input);
  const scopes=[
    {scope:"EXACT",context:{...c}},
    {scope:"TASK_ANY_RUNTIME",context:{...c,runtime:WILDCARD}},
    {scope:"ROLE",context:{...c,taskClass:WILDCARD,runtime:WILDCARD}},
    {scope:"AGENT_GLOBAL",context:{
      agentId:c.agentId,
      modelId:WILDCARD,
      role:WILDCARD,
      taskClass:WILDCARD,
      runtime:WILDCARD
    }}
  ];

  const seen=new Set();
  return scopes.filter(item=>{
    const key=JSON.stringify(FIELDS.map(field=>item.context[field]));
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item=>Object.freeze({
    scope:item.scope,
    context:Object.freeze(item.context),
    key:profileContextKey(item.context)
  }));
}
