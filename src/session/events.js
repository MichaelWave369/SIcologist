export const SESSION_EVENT_TYPES=Object.freeze([
  "PROMPT",
  "RESPONSE",
  "TOOL_CALL",
  "TOOL_RESULT",
  "MEMORY_READ",
  "MEMORY_WRITE",
  "ROLE_CHANGE",
  "CHALLENGE",
  "ERROR",
  "RETRY",
  "INTERVENTION",
  "RECOVERY"
]);

const EVENT_TYPES=new Set(SESSION_EVENT_TYPES);

function finiteOrUndefined(value,min=0,max=1){
  if(typeof value!=="number"||!Number.isFinite(value)) return undefined;
  return Math.min(max,Math.max(min,value));
}

export function normalizeSessionEvent(event,expectedSeq){
  if(!event||typeof event!=="object"||Array.isArray(event)) throw new TypeError("Session event must be an object");
  if(!EVENT_TYPES.has(event.type)) throw new TypeError(`Unsupported session event type: ${event.type}`);

  const seq=event.seq??expectedSeq;
  if(!Number.isInteger(seq)||seq<1) throw new TypeError("Session event seq must be a positive integer");
  if(expectedSeq!==undefined&&seq!==expectedSeq) throw new RangeError(`Expected session event seq ${expectedSeq}, got ${seq}`);

  const out={
    seq,
    type:event.type,
    at:typeof event.at==="string"?event.at:null
  };

  for(const key of ["id","actor","content","tool","status","role"]){
    if(typeof event[key]==="string") out[key]=event[key];
  }

  for(const key of ["authorized","roleViolation","memoryTrusted","challengeAccepted"]){
    if(typeof event[key]==="boolean") out[key]=event[key];
  }

  for(const key of ["confidence","goalAlignment","contextLoad"]){
    const n=finiteOrUndefined(event[key]);
    if(n!==undefined) out[key]=n;
  }

  const recoveryDelta=finiteOrUndefined(event.recoveryDelta,-1,1);
  if(recoveryDelta!==undefined) out.recoveryDelta=recoveryDelta;

  if(Array.isArray(event.claims)){
    out.claims=event.claims
      .filter(c=>c&&typeof c==="object"&&typeof c.text==="string"&&typeof c.supported==="boolean")
      .map(c=>({text:c.text,supported:c.supported}));
  }

  if(event.metadata&&typeof event.metadata==="object"&&!Array.isArray(event.metadata)){
    out.metadata=structuredClone(event.metadata);
  }

  return Object.freeze(out);
}
