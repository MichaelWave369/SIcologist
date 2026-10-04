export function emptyMetricStats(){
  return {n:0,mean:0,m2:0,min:null,max:null};
}

export function updateMetricStats(current,value){
  if(typeof value!=="number"||!Number.isFinite(value)){
    throw new TypeError("Metric sample must be a finite number");
  }

  const previous=current??emptyMetricStats();
  const n=previous.n+1;
  const delta=value-previous.mean;
  const mean=previous.mean+delta/n;
  const delta2=value-mean;
  const m2=previous.m2+delta*delta2;

  return {
    n,
    mean,
    m2,
    min:previous.min===null?value:Math.min(previous.min,value),
    max:previous.max===null?value:Math.max(previous.max,value)
  };
}

export function summarizeMetricStats(stats){
  const n=stats?.n??0;
  if(!n) return {n:0,mean:null,variance:null,stddev:null,min:null,max:null};
  const variance=n>1?stats.m2/(n-1):0;
  return {
    n,
    mean:Number(stats.mean.toFixed(6)),
    variance:Number(variance.toFixed(6)),
    stddev:Number(Math.sqrt(variance).toFixed(6)),
    min:stats.min,
    max:stats.max
  };
}

export function profileMaturity(sampleCount,{warmAt=5,establishedAt=10}={}){
  if(sampleCount>=establishedAt) return "ESTABLISHED";
  if(sampleCount>=warmAt) return "WARM";
  return "COLD";
}
