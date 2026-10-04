function round(value){ return Number(value.toFixed(9)); }
function mean(values){ return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null; }

export function multiclassBrier(ranking,truthHypothesisId){
  if(!ranking?.length) throw new TypeError("ranking is required");
  const sum=ranking.reduce((total,item)=>{
    const target=item.hypothesisId===truthHypothesisId?1:0;
    const probability=item.posteriorWeight??0;
    return total+(probability-target)**2;
  },0);
  return round(sum/ranking.length);
}

export function logLoss(ranking,truthHypothesisId,{epsilon=1e-15}={}){
  const item=ranking?.find(row=>row.hypothesisId===truthHypothesisId);
  if(!item) throw new Error("Truth hypothesis "+truthHypothesisId+" missing from ranking");
  return round(-Math.log(Math.max(epsilon,item.posteriorWeight)));
}

export function calibrationBins(predictions,{binCount=5}={}){
  if(!Number.isInteger(binCount)||binCount<2) throw new TypeError("binCount must be an integer >= 2");
  const bins=Array.from({length:binCount},(_,index)=>({
    index,
    lower:index/binCount,
    upper:(index+1)/binCount,
    rows:[]
  }));

  for(const prediction of predictions){
    const confidence=Math.min(1,Math.max(0,prediction.confidence));
    const index=Math.min(binCount-1,Math.floor(confidence*binCount));
    bins[index].rows.push({...prediction,confidence});
  }

  const total=predictions.length||1;
  let ece=0;
  const summarized=bins.map(bin=>{
    const count=bin.rows.length;
    const avgConfidence=count?mean(bin.rows.map(row=>row.confidence)):null;
    const accuracy=count?mean(bin.rows.map(row=>row.correct?1:0)):null;
    const gap=count?Math.abs(avgConfidence-accuracy):null;
    if(count) ece+=(count/total)*gap;
    return {
      index:bin.index,
      lower:round(bin.lower),
      upper:round(bin.upper),
      count,
      averageConfidence:avgConfidence===null?null:round(avgConfidence),
      accuracy:accuracy===null?null:round(accuracy),
      absoluteGap:gap===null?null:round(gap)
    };
  });

  return {bins:summarized,expectedCalibrationError:round(ece)};
}

export function confusionMatrix(rows){
  const matrix={};
  for(const row of rows){
    matrix[row.truth]??={};
    matrix[row.truth][row.predicted]=(matrix[row.truth][row.predicted]??0)+1;
  }
  return Object.fromEntries(
    Object.entries(matrix).sort(([a],[b])=>a.localeCompare(b)).map(([truth,predicted])=>[
      truth,
      Object.fromEntries(Object.entries(predicted).sort(([a],[b])=>a.localeCompare(b)))
    ])
  );
}
