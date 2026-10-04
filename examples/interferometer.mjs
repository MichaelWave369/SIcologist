import {analyzeFactorialInteraction} from "../src/index.js";

const result=analyzeFactorialInteraction({
  metric:"progressRate",
  control:.20,
  a:.35,
  b:.30,
  ab:.70,
  threshold:.10
});

console.log(JSON.stringify(result,null,2));
