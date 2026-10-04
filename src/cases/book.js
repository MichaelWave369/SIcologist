import {fingerprint} from "../experiment/fingerprint.js";
import {CaseFile} from "./case-file.js";
import {recommendFromHistory,summarizeInterventionHistory} from "./history.js";

function snapshotOf(caseFile){
  return typeof caseFile?.snapshot==="function"?caseFile.snapshot():caseFile;
}

function caseContainsCondition(snapshot,conditionId){
  return (snapshot?.events??[]).some(event=>{
    if(event.type==="ASSESSMENT_RECORDED"){
      const assessment=event.data?.assessment;
      return (assessment?.findings??[]).some(f=>f.id===conditionId)||
        (assessment?.conditions??[]).some(c=>c.id===conditionId&&c.active);
    }
    if(event.type==="RECOVERY_RECORDED"){
      return event.data?.conditionId===conditionId;
    }
    if(event.type==="INTERVENTION_APPLIED"){
      return event.data?.targetCondition===conditionId;
    }
    return false;
  });
}

export class CaseBook{
  #cases=new Map();
  #ordinals=new Map();

  openCase({
    agentId,
    context={},
    title="",
    sourceFingerprint=null,
    openedAt=null
  }){
    if(typeof agentId!=="string"||!agentId.trim()) throw new TypeError("agentId is required");
    const cleanAgent=agentId.trim();
    const ordinal=(this.#ordinals.get(cleanAgent)??0)+1;
    this.#ordinals.set(cleanAgent,ordinal);

    const caseId=fingerprint({
      kind:"SIcologistCase",
      agentId:cleanAgent,
      ordinal,
      title:String(title??""),
      context,
      sourceFingerprint
    });

    const file=new CaseFile({
      caseId,
      agentId:cleanAgent,
      context,
      title,
      sourceFingerprint,
      openedAt
    });
    this.#cases.set(caseId,file);
    return file;
  }

  get(caseId){
    return this.#cases.get(caseId)??null;
  }

  cases({agentId=null,state=null}={}){
    return [...this.#cases.values()]
      .map(file=>file.snapshot())
      .filter(snapshot=>!agentId||snapshot.agentId===agentId)
      .filter(snapshot=>!state||snapshot.state===state)
      .sort((a,b)=>a.caseId.localeCompare(b.caseId));
  }

  recurrence(agentId,conditionId){
    const matches=this.cases({agentId})
      .filter(snapshot=>caseContainsCondition(snapshot,conditionId));

    return {
      agentId,
      conditionId,
      episodes:matches.length,
      caseIds:matches.map(item=>item.caseId).sort(),
      openCases:matches.filter(item=>item.state!=="CLOSED").length,
      closedCases:matches.filter(item=>item.state==="CLOSED").length
    };
  }

  interventionHistory({agentId=null,conditionId=null}={}){
    return summarizeInterventionHistory(this.cases(),{agentId,conditionId});
  }

  recommend({agentId=null,conditionId=null,minMeasured=2}={}){
    return recommendFromHistory(
      this.interventionHistory({agentId,conditionId}),
      {minMeasured}
    );
  }

  export(){
    const body={
      version:"0.5.0",
      cases:this.cases(),
      ordinals:Object.fromEntries([...this.#ordinals.entries()].sort(([a],[b])=>a.localeCompare(b)))
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="0.5.0") throw new TypeError("Unsupported case book snapshot version");
    const body={
      version:snapshot.version,
      cases:snapshot.cases??[],
      ordinals:snapshot.ordinals??{}
    };
    if(snapshot.fingerprint&&fingerprint(body)!==snapshot.fingerprint){
      throw new Error("Case book snapshot fingerprint mismatch");
    }

    const book=new CaseBook();
    for(const item of body.cases){
      const file=CaseFile.fromSnapshot(item);
      book.#cases.set(file.id(),file);
    }
    book.#ordinals=new Map(Object.entries(body.ordinals));
    return book;
  }
}
