function round(value){
  return Number(value.toFixed(9));
}

function normalizeDistribution(ranking){
  const rows=(ranking??[])
    .filter(item=>typeof item?.hypothesisId==="string")
    .map(item=>({
      hypothesisId:item.hypothesisId,
      label:item.label??item.hypothesisId,
      weight:
        typeof item.posteriorWeight==="number"
          ? Math.max(0,item.posteriorWeight)
          : typeof item.weight==="number"
            ? Math.max(0,item.weight)
            : 0
    }));

  const total=rows.reduce((sum,item)=>sum+item.weight,0);
  if(!rows.length) throw new TypeError("Review ranking must contain at least one hypothesis");
  if(total<=0) throw new TypeError("Review ranking must contain positive weight");

  return rows
    .map(item=>({...item,weight:item.weight/total}))
    .sort((a,b)=>a.hypothesisId.localeCompare(b.hypothesisId));
}

function mapOf(distribution){
  return new Map(distribution.map(item=>[item.hypothesisId,item]));
}

export function totalVariationDistance(aRanking,bRanking){
  const a=mapOf(normalizeDistribution(aRanking));
  const b=mapOf(normalizeDistribution(bRanking));
  const ids=new Set([...a.keys(),...b.keys()]);
  let sum=0;
  for(const id of ids){
    sum+=Math.abs((a.get(id)?.weight??0)-(b.get(id)?.weight??0));
  }
  return round(.5*sum);
}

function jaccard(aValues,bValues){
  const a=new Set(aValues??[]);
  const b=new Set(bValues??[]);
  if(!a.size&&!b.size) return 1;
  const union=new Set([...a,...b]);
  let intersection=0;
  for(const value of a) if(b.has(value)) intersection+=1;
  return union.size?intersection/union.size:1;
}

function pairwise(values,fn){
  const out=[];
  for(let i=0;i<values.length;i+=1){
    for(let j=i+1;j<values.length;j+=1){
      out.push(fn(values[i],values[j]));
    }
  }
  return out;
}

function mean(values){
  return values.length
    ? values.reduce((sum,value)=>sum+value,0)/values.length
    : null;
}

export function aggregateConferenceReviews(reviews=[]){
  if(!Array.isArray(reviews)||reviews.length<1){
    throw new TypeError("At least one review is required");
  }

  const conditionIds=new Set(reviews.map(review=>review.differential?.conditionId));
  if(conditionIds.size!==1||conditionIds.has(undefined)){
    throw new Error("All conference reviews must target the same condition");
  }

  const distributions=reviews.map(review=>normalizeDistribution(review.differential.ranking));
  const hypothesisIds=[...new Set(distributions.flatMap(rows=>rows.map(row=>row.hypothesisId)))].sort();
  const labels=new Map();
  for(const distribution of distributions){
    for(const item of distribution) if(!labels.has(item.hypothesisId)) labels.set(item.hypothesisId,item.label);
  }

  const consensus=hypothesisIds.map(hypothesisId=>{
    const weight=mean(distributions.map(rows=>mapOf(rows).get(hypothesisId)?.weight??0))??0;
    return {
      hypothesisId,
      label:labels.get(hypothesisId)??hypothesisId,
      weight:round(weight)
    };
  }).sort((a,b)=>b.weight-a.weight||a.hypothesisId.localeCompare(b.hypothesisId))
    .map((item,index)=>({rank:index+1,...item}));

  const topChoices=reviews.map((review,index)=>{
    const ordered=[...distributions[index]].sort((a,b)=>b.weight-a.weight||a.hypothesisId.localeCompare(b.hypothesisId));
    return {
      reviewerId:review.reviewerId,
      role:review.role,
      hypothesisId:ordered[0].hypothesisId,
      label:ordered[0].label,
      weight:round(ordered[0].weight)
    };
  });

  const votes=new Map();
  for(const choice of topChoices) votes.set(choice.hypothesisId,(votes.get(choice.hypothesisId)??0)+1);
  const modal=[...votes.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
  const modalTopHypothesis=modal
    ? {
        hypothesisId:modal[0],
        label:labels.get(modal[0])??modal[0],
        votes:modal[1]
      }
    : null;

  const minorityHypotheses=[...votes.entries()]
    .filter(([hypothesisId])=>hypothesisId!==modalTopHypothesis?.hypothesisId)
    .map(([hypothesisId,voteCount])=>({
      hypothesisId,
      label:labels.get(hypothesisId)??hypothesisId,
      topChoiceVotes:voteCount,
      reviewers:topChoices.filter(choice=>choice.hypothesisId===hypothesisId).map(choice=>choice.reviewerId).sort()
    }))
    .sort((a,b)=>b.topChoiceVotes-a.topChoiceVotes||a.hypothesisId.localeCompare(b.hypothesisId));

  const distances=pairwise(distributions,totalVariationDistance);
  const averagePairwiseDisagreement=round(mean(distances)??0);

  const evidenceSets=reviews.map(review=>[...new Set(review.evidenceRefs??[])].sort());
  const evidenceOverlaps=pairwise(evidenceSets,jaccard);
  const meanEvidenceOverlap=round(mean(evidenceOverlaps)??1);
  const sharedEvidenceRefs=evidenceSets.length
    ? evidenceSets[0].filter(ref=>evidenceSets.every(set=>set.includes(ref))).sort()
    : [];

  return {
    conditionId:[...conditionIds][0],
    reviewerCount:reviews.length,
    consensus,
    modalTopHypothesis,
    topAgreement:round(modalTopHypothesis?modalTopHypothesis.votes/reviews.length:0),
    topChoices,
    averagePairwiseDisagreement,
    consensusStrength:round(1-averagePairwiseDisagreement),
    minorityHypotheses,
    meanEvidenceOverlap,
    sharedEvidenceRefs,
    evidenceByReviewer:reviews.map((review,index)=>({
      reviewerId:review.reviewerId,
      role:review.role,
      evidenceRefCount:evidenceSets[index].length,
      evidenceRefs:evidenceSets[index]
    })).sort((a,b)=>a.reviewerId.localeCompare(b.reviewerId)),
    epistemicStatus:"CONSENSUS_IS_NOT_TRUTH",
    explanationStatus:"NOT_ESTABLISHED"
  };
}

export function compareConferenceRounds(blindAggregate,finalAggregate){
  const blindRanking=(blindAggregate?.consensus??[]).map(item=>({
    hypothesisId:item.hypothesisId,
    label:item.label,
    posteriorWeight:item.weight
  }));
  const finalRanking=(finalAggregate?.consensus??[]).map(item=>({
    hypothesisId:item.hypothesisId,
    label:item.label,
    posteriorWeight:item.weight
  }));

  const convergenceDelta=round(
    (blindAggregate?.averagePairwiseDisagreement??0)-
    (finalAggregate?.averagePairwiseDisagreement??0)
  );
  const groupShift=totalVariationDistance(blindRanking,finalRanking);

  let direction="UNCHANGED";
  if(convergenceDelta>0) direction="CONVERGED";
  if(convergenceDelta<0) direction="DIVERGED";

  return {
    blindDisagreement:blindAggregate?.averagePairwiseDisagreement??null,
    finalDisagreement:finalAggregate?.averagePairwiseDisagreement??null,
    convergenceDelta,
    direction,
    groupShift,
    epistemicStatus:"CONVERGENCE_IS_NOT_VALIDATION"
  };
}
