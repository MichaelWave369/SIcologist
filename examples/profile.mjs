import {LongitudinalProfileBook} from "../src/index.js";

const book=new LongitudinalProfileBook();
const context={
  agentId:"builder-07",
  modelId:"local-model",
  role:"builder",
  taskClass:"code-repair",
  runtime:"local"
};

for(let i=1;i<=6;i+=1){
  book.admit({
    ledgerValid:true,
    metrics:{
      repetitionRate:.10+i*.005,
      progressRate:.78+i*.01,
      confidence:.62+i*.01,
      evidenceStrength:.72+i*.01
    },
    assessment:{findings:[]}
  },context,{
    sampleId:`qualified-${i}`,
    qualification:"QUALIFIED",
    trusted:true
  });
}

const current={
  ledgerValid:true,
  metrics:{
    repetitionRate:.62,
    progressRate:.35,
    confidence:.94,
    evidenceStrength:.31
  },
  assessment:{findings:[]}
};

console.log(JSON.stringify(book.evaluate(current,context),null,2));
