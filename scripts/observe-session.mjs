import {readFile} from "node:fs/promises";
import {observeSession} from "../src/index.js";

const path=process.argv[2];
if(!path){
  console.error("Usage: npm run observe -- <session.json>");
  process.exitCode=2;
}else{
  const raw=JSON.parse(await readFile(path,"utf8"));
  const events=Array.isArray(raw)?raw:raw.events;
  if(!Array.isArray(events)) throw new TypeError("Session file must be an array or an object with an events array");
  console.log(JSON.stringify(observeSession(events),null,2));
}
