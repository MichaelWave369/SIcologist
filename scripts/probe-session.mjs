import {readFile} from "node:fs/promises";
import {evaluateProbePair} from "../src/index.js";

const path=process.argv[2];
if(!path){
  console.error("Usage: npm run probe -- <experiment.json>");
  process.exitCode=2;
}else{
  const data=JSON.parse(await readFile(path,"utf8"));
  const result=evaluateProbePair(data);
  console.log(JSON.stringify(result,null,2));
}
