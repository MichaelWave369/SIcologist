import {assessObservation} from "../assess.js";
import {planIntervention} from "../interventions.js";
import {BehaviorLedger} from "../ledger.js";
import {normalizeSessionEvent} from "./events.js";
import {deriveSessionMetrics,summarizeEventTypes} from "./metrics.js";

export class AgentSessionObservatory{
  #events=[];
  #baseline;
  #ledger;

  constructor({baseline={},ledger=new BehaviorLedger()}={}){
    this.#baseline={...baseline};
    this.#ledger=ledger;
  }

  ingest(event){
    const normalized=normalizeSessionEvent(event,this.#events.length+1);
    this.#events.push(normalized);
    this.#ledger.append(
      {type:"session_event",event:normalized},
      {at:normalized.at??`sequence:${normalized.seq}`}
    );
    return normalized;
  }

  ingestMany(events=[]){
    return events.map(event=>this.ingest(event));
  }

  events(){
    return this.#events.map(event=>structuredClone(event));
  }

  ledger(){
    return this.#ledger;
  }

  snapshot(){
    const metrics=deriveSessionMetrics(this.#events);
    const assessment=assessObservation(metrics,this.#baseline);
    const plan=planIntervention(assessment);
    return {
      eventCount:this.#events.length,
      byType:summarizeEventTypes(this.#events),
      metrics,
      metricCoverage:Object.keys(metrics).sort(),
      assessment,
      plan,
      ledgerValid:this.#ledger.verify()
    };
  }
}

export function observeSession(events,{baseline={}}={}){
  const observer=new AgentSessionObservatory({baseline});
  observer.ingestMany(events);
  return observer.snapshot();
}
