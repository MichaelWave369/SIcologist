function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:undefined;
}

function clamp01(value){
  return Math.min(1,Math.max(0,value));
}

export function normalizeBehaviorText(text=""){
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g," <url> ")
    .replace(/[^\p{L}\p{N}<>]+/gu," ")
    .replace(/\s+/g," ")
    .trim();
}

function tokenSet(text){
  return new Set(normalizeBehaviorText(text).split(" ").filter(Boolean));
}

export function textSimilarity(a,b){
  const A=tokenSet(a),B=tokenSet(b);
  if(A.size===0&&B.size===0) return 1;
  if(A.size===0||B.size===0) return 0;
  let intersection=0;
  for(const token of A) if(B.has(token)) intersection+=1;
  const union=A.size+B.size-intersection;
  return union?intersection/union:0;
}

function deriveRepetition(events){
  const responses=events.filter(e=>e.type==="RESPONSE"&&typeof e.content==="string"&&e.content.trim());
  if(responses.length<2) return undefined;
  const maxima=[];
  for(let i=1;i<responses.length;i+=1){
    let strongest=0;
    for(let j=0;j<i;j+=1){
      strongest=Math.max(strongest,textSimilarity(responses[i].content,responses[j].content));
    }
    maxima.push(strongest);
  }
  return mean(maxima);
}

function deriveProgress(events){
  let successes=0,failures=0;
  for(const event of events){
    if(event.type==="TOOL_RESULT"){
      const status=(event.status??"").toLowerCase();
      if(["success","ok","passed","pass"].includes(status)) successes+=1;
      if(["failure","failed","error","denied","timeout"].includes(status)) failures+=1;
    }
    if(event.type==="ERROR"||event.type==="RETRY") failures+=1;
  }
  const total=successes+failures;
  return total?successes/total:undefined;
}

function deriveRetryRate(events){
  const calls=events.filter(e=>e.type==="TOOL_CALL").length;
  const retries=events.filter(e=>e.type==="RETRY").length;
  if(!calls&&!retries) return undefined;
  if(!calls) return 1;
  return clamp01(retries/calls);
}

function deriveClaims(events){
  const claims=events.flatMap(e=>Array.isArray(e.claims)?e.claims:[]);
  if(!claims.length) return {};
  const supported=claims.filter(c=>c.supported).length;
  return {
    evidenceStrength:supported/claims.length,
    confabulationRisk:(claims.length-supported)/claims.length
  };
}

function deriveMemoryContamination(events){
  const reads=events.filter(e=>e.type==="MEMORY_READ"&&typeof e.memoryTrusted==="boolean");
  if(!reads.length) return undefined;
  return reads.filter(e=>!e.memoryTrusted).length/reads.length;
}

function deriveRoleBleed(events){
  const scored=events.filter(e=>typeof e.roleViolation==="boolean");
  if(!scored.length) return undefined;
  return scored.filter(e=>e.roleViolation).length/scored.length;
}

function deriveChallengeAcceptance(events){
  const challenges=events.filter(e=>e.type==="CHALLENGE"&&typeof e.challengeAccepted==="boolean");
  if(!challenges.length) return undefined;
  return challenges.filter(e=>e.challengeAccepted).length/challenges.length;
}

function deriveConsensusDiversity(events){
  const finalByActor=new Map();
  for(const event of events){
    if(event.type==="RESPONSE"&&event.actor&&event.content) finalByActor.set(event.actor,event.content);
  }
  const responses=[...finalByActor.values()];
  if(responses.length<2) return undefined;
  const unique=new Set(responses.map(normalizeBehaviorText)).size;
  return clamp01((unique-1)/(responses.length-1));
}

function deriveAuthorityPressure(events){
  const scored=events.filter(e=>
    ["TOOL_CALL","MEMORY_WRITE","ROLE_CHANGE","INTERVENTION"].includes(e.type)&&
    typeof e.authorized==="boolean"
  );
  if(!scored.length) return undefined;
  return scored.filter(e=>!e.authorized).length/scored.length;
}

function lastNumeric(events,key,filter=()=>true){
  for(let i=events.length-1;i>=0;i-=1){
    const event=events[i];
    if(filter(event)&&typeof event[key]==="number") return event[key];
  }
  return undefined;
}

export function deriveSessionMetrics(events=[]){
  const metrics={};
  const repetitionRate=deriveRepetition(events);
  const progressRate=deriveProgress(events);
  const toolRetryRate=deriveRetryRate(events);
  const memoryContamination=deriveMemoryContamination(events);
  const roleBleedRate=deriveRoleBleed(events);
  const challengerAcceptance=deriveChallengeAcceptance(events);
  const consensusDiversity=deriveConsensusDiversity(events);
  const authorityPressure=deriveAuthorityPressure(events);
  const claims=deriveClaims(events);
  const confidences=events.filter(e=>e.type==="RESPONSE"&&typeof e.confidence==="number").map(e=>e.confidence);
  const goalScores=events.filter(e=>typeof e.goalAlignment==="number").map(e=>e.goalAlignment);
  const contextLoads=events.filter(e=>typeof e.contextLoad==="number").map(e=>e.contextLoad);
  const recoveryDeltas=events.filter(e=>e.type==="RECOVERY"&&typeof e.recoveryDelta==="number").map(e=>e.recoveryDelta);

  const pairs={
    repetitionRate,
    progressRate,
    toolRetryRate,
    memoryContamination,
    roleBleedRate,
    challengerAcceptance,
    consensusDiversity,
    authorityPressure,
    confidence:mean(confidences),
    goalAlignment:mean(goalScores),
    contextLoad:contextLoads.length?Math.max(...contextLoads):undefined,
    recoveryDelta:recoveryDeltas.length?recoveryDeltas.at(-1):undefined,
    ...claims
  };

  for(const [key,value] of Object.entries(pairs)){
    if(typeof value==="number"&&Number.isFinite(value)) metrics[key]=Number(value.toFixed(6));
  }

  return metrics;
}

export function summarizeEventTypes(events=[]){
  const byType={};
  for(const event of events) byType[event.type]=(byType[event.type]??0)+1;
  return byType;
}
