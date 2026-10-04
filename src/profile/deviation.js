function classify(absZ){
  if(absZ>=4) return "EXTREME";
  if(absZ>=3) return "HIGH";
  if(absZ>=2) return "MODERATE";
  return "STABLE";
}

function direction(delta){
  if(delta>0) return "UP";
  if(delta<0) return "DOWN";
  return "UNCHANGED";
}

export function compareMetricsToProfile(metrics,profile,{
  minSamples=5,
  varianceFloor=.05
}={}){
  if(!profile||typeof profile!=="object") throw new TypeError("profile is required");
  const deviations=[];
  const unavailable=[];

  for(const [metric,value] of Object.entries(metrics??{})){
    if(typeof value!=="number"||!Number.isFinite(value)) continue;
    const stats=profile.metrics?.[metric];
    if(!stats||stats.n<minSamples||typeof stats.mean!=="number"){
      unavailable.push({metric,reason:"INSUFFICIENT_BASELINE",samples:stats?.n??0});
      continue;
    }

    const rawStd=typeof stats.stddev==="number"?stats.stddev:0;
    const scale=Math.max(rawStd,varianceFloor);
    const delta=value-stats.mean;
    const z=delta/scale;
    deviations.push({
      metric,
      value,
      baselineMean:stats.mean,
      baselineStddev:rawStd,
      baselineSamples:stats.n,
      varianceFloor,
      delta:Number(delta.toFixed(6)),
      zScore:Number(z.toFixed(6)),
      absZ:Number(Math.abs(z).toFixed(6)),
      direction:direction(delta),
      classification:classify(Math.abs(z))
    });
  }

  deviations.sort((a,b)=>b.absZ-a.absZ||a.metric.localeCompare(b.metric));
  const scored=deviations.filter(item=>item.classification!=="STABLE");

  return {
    profileId:profile.profileId,
    profileScope:profile.scope,
    profileContext:profile.context,
    profileMaturity:profile.maturity,
    comparedMetrics:deviations.length,
    unavailable,
    deviations,
    notable:scored,
    maxAbsZ:deviations.length?deviations[0].absZ:null,
    status:scored.length?"SELF_DEVIATION_DETECTED":"WITHIN_ESTABLISHED_VARIATION"
  };
}
