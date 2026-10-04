function conditionScore(assessment,id){
  const evaluated=assessment?.conditions?.find(condition=>condition.id===id);
  if(evaluated){
    if(evaluated.evaluable===false) return null;
    return typeof evaluated.confidence==="number"?evaluated.confidence:null;
  }

  const finding=assessment?.findings?.find(item=>item.id===id);
  if(finding) return typeof finding.confidence==="number"?finding.confidence:1;

  if(Array.isArray(assessment?.unevaluable)&&assessment.unevaluable.some(item=>item.id===id)){
    return null;
  }

  return 0;
}

export function compareRecovery(before,after,conditionId){
  const b=conditionScore(before,conditionId);
  const a=conditionScore(after,conditionId);

  if(b===null||a===null){
    return {
      conditionId,
      before:b,
      after:a,
      delta:null,
      outcome:"INSUFFICIENT_DATA"
    };
  }

  const delta=Number((b-a).toFixed(6));
  let outcome="UNCHANGED";
  if(delta>0) outcome="IMPROVED";
  if(delta<0) outcome="DEGRADED";
  if(b>0&&a===0) outcome="RECOVERED";

  return {conditionId,before:b,after:a,delta,outcome};
}
