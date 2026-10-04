import {createHash} from "node:crypto";

export function canonicalize(value){
  if(Array.isArray(value)) return value.map(canonicalize);
  if(value&&typeof value==="object"){
    return Object.fromEntries(
      Object.keys(value).sort().map(key=>[key,canonicalize(value[key])])
    );
  }
  return value;
}

export function fingerprint(value){
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}
