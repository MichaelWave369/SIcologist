import {createHash} from "node:crypto";
function canonicalize(v){if(Array.isArray(v))return v.map(canonicalize);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])]));return v}
function digest(v){return createHash("sha256").update(JSON.stringify(canonicalize(v))).digest("hex")}
export class BehaviorLedger{
  #entries=[];
  append(event,{at=new Date().toISOString()}={}){
    const seq=this.#entries.length+1,prevHash=this.#entries.at(-1)?.hash??null,payload={seq,at,prevHash,event:canonicalize(event)};
    const entry=Object.freeze({...payload,hash:digest(payload)});this.#entries.push(entry);return entry;
  }
  entries(){return this.#entries.map(e=>({...e}))}
  verify(){let prevHash=null;for(let i=0;i<this.#entries.length;i++){const e=this.#entries[i];if(e.seq!==i+1||e.prevHash!==prevHash)return false;const {hash,...payload}=e;if(digest(payload)!==hash)return false;prevHash=hash}return true}
}
