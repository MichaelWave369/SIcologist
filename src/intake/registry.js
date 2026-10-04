import {fingerprint} from "../experiment/fingerprint.js";
import {RealCaseCandidate} from "./candidate.js";

function datasetEnvelope(kind,cases){
  const body={
    version:"REAL_CASE_DATASET_V0.1",
    kind,
    externalValidity:"CANDIDATE",
    labelSemantics:"ADJUDICATED_REFERENCE",
    cases
  };
  return {...body,fingerprint:fingerprint(body)};
}

export class RealCaseDatasetRegistry{
  #candidates=new Map();
  #sourceFingerprints=new Set();
  #lineageUses=new Map();
  #evidenceUses=new Map();

  ingest(options){
    const candidate=new RealCaseCandidate(options);
    const identity=candidate.identity();

    if(this.#sourceFingerprints.has(identity.sourceFingerprint)){
      throw new Error("EXACT_SOURCE_DUPLICATE");
    }

    const existingLineageUse=this.#lineageUses.get(identity.lineageFingerprint);
    if(existingLineageUse&&existingLineageUse!==identity.datasetUse){
      throw new Error("LINEAGE_SPLIT_COLLISION");
    }

    for(const ref of identity.sourceRefs){
      const existingUse=this.#evidenceUses.get(ref);
      if(existingUse&&existingUse!==identity.datasetUse){
        throw new Error("EVIDENCE_SPLIT_COLLISION: "+ref);
      }
    }

    this.#candidates.set(candidate.id(),candidate);
    this.#sourceFingerprints.add(identity.sourceFingerprint);
    this.#lineageUses.set(identity.lineageFingerprint,identity.datasetUse);
    for(const ref of identity.sourceRefs) this.#evidenceUses.set(ref,identity.datasetUse);

    return candidate;
  }

  get(candidateId){
    return this.#candidates.get(candidateId)??null;
  }

  candidates(){
    return [...this.#candidates.values()]
      .map(candidate=>candidate.snapshot())
      .sort((a,b)=>a.candidateId.localeCompare(b.candidateId));
  }

  audit(){
    const snapshots=this.candidates();
    const byStatus={};
    const byUse={};
    for(const item of snapshots){
      byStatus[item.status]=(byStatus[item.status]??0)+1;
      byUse[item.datasetUse]=(byUse[item.datasetUse]??0)+1;
    }

    return {
      candidates:snapshots.length,
      byStatus,
      byUse,
      sourceFingerprints:this.#sourceFingerprints.size,
      lineageFamilies:this.#lineageUses.size,
      evidenceRefs:this.#evidenceUses.size
    };
  }

  exportTrainingDataset(){
    const cases=[...this.#candidates.values()]
      .filter(candidate=>candidate.status()==="APPROVED")
      .filter(candidate=>candidate.datasetUse()==="TRAIN_CANDIDATE")
      .map(candidate=>candidate.toDatasetCase())
      .sort((a,b)=>a.trialId.localeCompare(b.trialId));

    return datasetEnvelope("REAL_CASE_TRAINING_CANDIDATES",cases);
  }

  exportEvaluationQuarantine(){
    const cases=[...this.#candidates.values()]
      .filter(candidate=>candidate.status()==="APPROVED")
      .filter(candidate=>candidate.datasetUse()==="EVAL_QUARANTINE")
      .map(candidate=>candidate.toDatasetCase())
      .sort((a,b)=>a.trialId.localeCompare(b.trialId));

    return datasetEnvelope("REAL_CASE_EVAL_QUARANTINE",cases);
  }

  export(){
    const body={
      version:"0.9.0",
      candidates:[...this.#candidates.values()]
        .map(candidate=>candidate.export())
        .sort((a,b)=>a.candidateId.localeCompare(b.candidateId))
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="0.9.0") throw new TypeError("Unsupported registry snapshot version");
    const {fingerprint:storedFingerprint,...body}=snapshot;
    if(fingerprint(body)!==storedFingerprint) throw new Error("Registry snapshot fingerprint mismatch");

    const registry=new RealCaseDatasetRegistry();
    for(const candidateSnapshot of snapshot.candidates??[]){
      const candidate=RealCaseCandidate.fromSnapshot(candidateSnapshot);
      const identity=candidate.identity();

      if(registry.#sourceFingerprints.has(identity.sourceFingerprint)){
        throw new Error("Duplicate source fingerprint in registry snapshot");
      }
      const existingLineageUse=registry.#lineageUses.get(identity.lineageFingerprint);
      if(existingLineageUse&&existingLineageUse!==identity.datasetUse){
        throw new Error("Lineage split collision in registry snapshot");
      }
      for(const ref of identity.sourceRefs){
        const existingUse=registry.#evidenceUses.get(ref);
        if(existingUse&&existingUse!==identity.datasetUse){
          throw new Error("Evidence split collision in registry snapshot");
        }
      }

      registry.#candidates.set(candidate.id(),candidate);
      registry.#sourceFingerprints.add(identity.sourceFingerprint);
      registry.#lineageUses.set(identity.lineageFingerprint,identity.datasetUse);
      for(const ref of identity.sourceRefs) registry.#evidenceUses.set(ref,identity.datasetUse);
    }
    return registry;
  }
}
