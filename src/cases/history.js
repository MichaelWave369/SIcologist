import {authorizeAction} from "../interventions.js";

function asSnapshot(caseLike){
  return typeof caseLike?.snapshot==="function"?caseLike.snapshot():caseLike;
}

export function extractInterventionEpisodes(caseLike){
  const snapshot=asSnapshot(caseLike);
  const events=snapshot?.events??[];
  const recoveriesByIntervention=new Map();

  for(const event of events){
    if(event.type!=="RECOVERY_RECORDED") continue;
    const id=event.data?.interventionId;
    if(!id) continue;
    const list=recoveriesByIntervention.get(id)??[];
    list.push(event);
    recoveriesByIntervention.set(id,list);
  }

  return events
    .filter(event=>event.type==="INTERVENTION_APPLIED")
    .map(event=>{
      const data=event.data??{};
      const recoveries=(recoveriesByIntervention.get(data.interventionId)??[])
        .sort((a,b)=>a.seq-b.seq);
      const recovery=recoveries.at(-1)??null;
      return {
        caseId:snapshot.caseId,
        agentId:snapshot.agentId,
        interventionId:data.interventionId,
        action:data.action,
        targetCondition:data.targetCondition,
        authorization:data.authorization,
        appliedSeq:event.seq,
        recoverySeq:recovery?.seq??null,
        outcome:recovery?.data?.outcome??"PENDING",
        delta:typeof recovery?.data?.delta==="number"?recovery.data.delta:null
      };
    });
}

function aggregateKey(episode){
  return `${episode.targetCondition}::${episode.action}`;
}

export function summarizeInterventionHistory(cases,{
  agentId=null,
  conditionId=null
}={}){
  const episodes=(cases??[])
    .flatMap(extractInterventionEpisodes)
    .filter(episode=>!agentId||episode.agentId===agentId)
    .filter(episode=>!conditionId||episode.targetCondition===conditionId);

  const groups=new Map();

  for(const episode of episodes){
    const key=aggregateKey(episode);
    let group=groups.get(key);
    if(!group){
      group={
        action:episode.action,
        targetCondition:episode.targetCondition,
        authorization:episode.authorization??authorizeAction(episode.action),
        attempts:0,
        measured:0,
        recovered:0,
        improved:0,
        unchanged:0,
        degraded:0,
        insufficientData:0,
        pending:0,
        deltaSum:0,
        deltaCount:0,
        caseIds:new Set()
      };
      groups.set(key,group);
    }

    group.attempts+=1;
    group.caseIds.add(episode.caseId);

    if(episode.outcome==="PENDING"){
      group.pending+=1;
      continue;
    }

    group.measured+=1;
    if(episode.outcome==="RECOVERED") group.recovered+=1;
    if(episode.outcome==="IMPROVED") group.improved+=1;
    if(episode.outcome==="UNCHANGED") group.unchanged+=1;
    if(episode.outcome==="DEGRADED") group.degraded+=1;
    if(episode.outcome==="INSUFFICIENT_DATA") group.insufficientData+=1;

    if(typeof episode.delta==="number"){
      group.deltaSum+=episode.delta;
      group.deltaCount+=1;
    }
  }

  const interventions=[...groups.values()].map(group=>{
    const beneficial=group.recovered+group.improved;
    const measuredForBenefit=group.recovered+group.improved+group.unchanged+group.degraded;
    return {
      action:group.action,
      targetCondition:group.targetCondition,
      authorization:group.authorization,
      attempts:group.attempts,
      measured:group.measured,
      recovered:group.recovered,
      improved:group.improved,
      unchanged:group.unchanged,
      degraded:group.degraded,
      insufficientData:group.insufficientData,
      pending:group.pending,
      beneficial,
      benefitRate:measuredForBenefit?Number((beneficial/measuredForBenefit).toFixed(6)):null,
      averageDelta:group.deltaCount?Number((group.deltaSum/group.deltaCount).toFixed(6)):null,
      caseCount:group.caseIds.size,
      caseIds:[...group.caseIds].sort(),
      evidenceKind:"OBSERVATIONAL_HISTORY",
      causalStatus:"CAUSALITY_NOT_ESTABLISHED"
    };
  }).sort((a,b)=>
    (b.measured-a.measured)||
    ((b.benefitRate??-1)-(a.benefitRate??-1))||
    a.action.localeCompare(b.action)
  );

  return {
    episodeCount:episodes.length,
    interventions,
    evidenceKind:"OBSERVATIONAL_HISTORY",
    causalStatus:"CAUSALITY_NOT_ESTABLISHED"
  };
}

export function recommendFromHistory(history,{minMeasured=2}={}){
  const eligible=(history?.interventions??[])
    .filter(item=>item.measured>=minMeasured)
    .filter(item=>item.benefitRate!==null)
    .sort((a,b)=>
      (b.benefitRate-a.benefitRate)||
      ((b.averageDelta??-Infinity)-(a.averageDelta??-Infinity))||
      (b.measured-a.measured)||
      a.action.localeCompare(b.action)
    );

  if(!eligible.length){
    return {
      status:"INSUFFICIENT_HISTORY",
      recommendation:null,
      causalStatus:"CAUSALITY_NOT_ESTABLISHED"
    };
  }

  const best=eligible[0];
  return {
    status:"HISTORICAL_RECOMMENDATION",
    recommendation:{
      action:best.action,
      targetCondition:best.targetCondition,
      authorization:authorizeAction(best.action),
      measuredEpisodes:best.measured,
      benefitRate:best.benefitRate,
      averageDelta:best.averageDelta,
      evidenceKind:"OBSERVATIONAL_HISTORY",
      causalStatus:"CAUSALITY_NOT_ESTABLISHED"
    },
    causalStatus:"CAUSALITY_NOT_ESTABLISHED"
  };
}
