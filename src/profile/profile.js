import {fingerprint} from "../experiment/fingerprint.js";
import {normalizeProfileContext,profileContextKey} from "./context.js";
import {emptyMetricStats,profileMaturity,summarizeMetricStats,updateMetricStats} from "./stats.js";
import {compareMetricsToProfile} from "./deviation.js";

const CRITICAL="critical";

export class LongitudinalProfile{
  #context;
  #scope;
  #metrics={};
  #samples=new Set();
  #acceptedSamples=0;
  #rejections={};

  constructor(context,{scope="EXACT"}={}){
    this.#context=normalizeProfileContext(context);
    this.#scope=scope;
  }

  #reject(reason){
    this.#rejections[reason]=(this.#rejections[reason]??0)+1;
    return {accepted:false,reason};
  }

  admit(report,{
    sampleId,
    qualification,
    trusted=false,
    allowCritical=false
  }={}){
    if(typeof sampleId!=="string"||!sampleId.trim()) return this.#reject("MISSING_SAMPLE_ID");
    if(qualification!=="QUALIFIED") return this.#reject("NOT_QUALIFIED");
    if(trusted!==true) return this.#reject("UNTRUSTED_SOURCE");
    if(report?.ledgerValid===false) return this.#reject("INVALID_LEDGER");

    const hasCritical=report?.assessment?.findings?.some(f=>f.severity===CRITICAL)??false;
    if(hasCritical&&!allowCritical) return this.#reject("CRITICAL_FINDING_PRESENT");

    const metrics=Object.fromEntries(
      Object.entries(report?.metrics??{}).filter(([,value])=>typeof value==="number"&&Number.isFinite(value))
    );
    if(!Object.keys(metrics).length) return this.#reject("NO_NUMERIC_METRICS");

    const sampleFingerprint=fingerprint({
      sampleId:sampleId.trim(),
      context:this.#context
    });
    if(this.#samples.has(sampleFingerprint)) return this.#reject("DUPLICATE_SAMPLE");

    for(const [metric,value] of Object.entries(metrics)){
      this.#metrics[metric]=updateMetricStats(this.#metrics[metric]??emptyMetricStats(),value);
    }

    this.#samples.add(sampleFingerprint);
    this.#acceptedSamples+=1;

    return {
      accepted:true,
      reason:"ACCEPTED",
      sampleFingerprint,
      profileId:this.id(),
      scope:this.#scope,
      acceptedSamples:this.#acceptedSamples
    };
  }

  id(){
    return fingerprint({
      kind:"SIcologistLongitudinalProfile",
      scope:this.#scope,
      context:this.#context
    });
  }

  contextKey(){
    return profileContextKey(this.#context);
  }

  snapshot(){
    const metrics={};
    for(const metric of Object.keys(this.#metrics).sort()){
      metrics[metric]=summarizeMetricStats(this.#metrics[metric]);
    }

    return {
      version:"0.4.0",
      profileId:this.id(),
      scope:this.#scope,
      context:{...this.#context},
      contextKey:this.contextKey(),
      acceptedSamples:this.#acceptedSamples,
      maturity:profileMaturity(this.#acceptedSamples),
      metrics,
      admittedSampleFingerprints:[...this.#samples].sort(),
      rejections:{...this.#rejections}
    };
  }

  compare(metrics,options={}){
    return compareMetricsToProfile(metrics,this.snapshot(),options);
  }

  export(){
    return {
      scope:this.#scope,
      context:{...this.#context},
      acceptedSamples:this.#acceptedSamples,
      metrics:structuredClone(this.#metrics),
      samples:[...this.#samples].sort(),
      rejections:{...this.#rejections}
    };
  }

  static fromSnapshot(snapshot){
    const profile=new LongitudinalProfile(snapshot.context,{scope:snapshot.scope});
    profile.#acceptedSamples=snapshot.acceptedSamples??0;
    profile.#metrics=structuredClone(snapshot.metrics??{});
    profile.#samples=new Set(snapshot.samples??[]);
    profile.#rejections=structuredClone(snapshot.rejections??{});
    return profile;
  }
}
