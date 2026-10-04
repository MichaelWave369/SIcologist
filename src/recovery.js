function score(a,id){return a?.findings?.find(f=>f.id===id)?.confidence??0}
export function compareRecovery(before,after,conditionId){
  const b=score(before,conditionId),a=score(after,conditionId),delta=Number((b-a).toFixed(6));
  let outcome="UNCHANGED";if(delta>0)outcome="IMPROVED";if(delta<0)outcome="DEGRADED";if(b>0&&a===0)outcome="RECOVERED";
  return {conditionId,before:b,after:a,delta,outcome};
}
