import {fingerprint} from "../experiment/fingerprint.js";
import {REPLICATION_EVIDENCE_GRADES} from "../replication/registry.js";
import {
  CLAIM_EVIDENCE_GRADES,
  CLAIM_EVIDENCE_RELATIONS,
  CLAIM_EVIDENCE_TYPES,
  CLAIM_STATUSES
} from "./types.js";

function clone(value){ return structuredClone(value); }

function cleanStrings(values=[]){
  return [...new Set(
    values
      .filter(value=>typeof value==="string"&&value.trim())
      .map(value=>value.trim())
  )].sort();
}

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function sha256(value,name){
  if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value)){
    throw new TypeError(name+" must be a 64-character lowercase hex SHA-256");
  }
  return value;
}

function normalizeScope(scope={}){
  if(scope===null||typeof scope!=="object"||Array.isArray(scope)){
    throw new TypeError("scope must be an object");
  }
  return Object.fromEntries(
    Object.entries(scope)
      .filter(([,value])=>value!==undefined)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,value])=>[key,clone(value)])
  );
}

function evidenceGrade({supports,contradicts,verifiedSupports,replicationGrades}){
  if(contradicts>0&&supports>0) return "CONTESTED_EVIDENCE";
  if(contradicts>0&&supports===0) return "ADVERSE_EVIDENCE_ONLY";
  if(supports===0) return "NO_EVIDENCE";

  if(replicationGrades.includes("ROBUST_REPLICATION_CANDIDATE")){
    return "ROBUST_REPLICATION_CANDIDATE";
  }
  if(replicationGrades.some(value=>[
    "SINGLE_REPLICATION_SUPPORT",
    "MULTI_REPLICATOR_SUPPORT",
    "CROSS_ENVIRONMENT_SUPPORT"
  ].includes(value))){
    return "REPLICATION_SUPPORT";
  }
  if(verifiedSupports>=2) return "MULTI_SOURCE_SUPPORT";
  return "PRELIMINARY_SUPPORT";
}

function claimStatus({supports,contradicts,supersededBy}){
  if(supersededBy) return "SUPERSEDED";
  if(supports>0&&contradicts>0) return "CONTESTED";
  if(supports>0) return "SUPPORT_ONLY";
  if(contradicts>0) return "CONTRADICTED";
  return "UNASSESSED";
}

export class ClaimEvidenceRegistry{
  #claims=new Map();
  #evidence=new Map();
  #claimEvidence=new Map();
  #latestByKey=new Map();

  createClaim({
    claimKey,
    statement,
    scope={},
    qualifiers=[],
    claimType="EXPLANATORY"
  }){
    if(typeof claimKey!=="string"||!claimKey.trim()) throw new TypeError("claimKey is required");
    if(typeof statement!=="string"||!statement.trim()) throw new TypeError("statement is required");
    if(typeof claimType!=="string"||!claimType.trim()) throw new TypeError("claimType is required");
    const key=claimKey.trim();
    if(this.#latestByKey.has(key)){
      throw new Error("Claim key already exists; revise the current claim instead");
    }

    const immutable={
      version:"CLAIM_V0.1",
      claimKey:key,
      revision:1,
      claimType:claimType.trim(),
      statement:statement.trim(),
      scope:normalizeScope(scope),
      qualifiers:cleanStrings(qualifiers),
      supersedes:null
    };
    const claimId=fingerprint(immutable);
    const record={
      ...immutable,
      claimId,
      supersededBy:null,
      revisionReason:null
    };
    this.#claims.set(claimId,record);
    this.#claimEvidence.set(claimId,new Set());
    this.#latestByKey.set(key,claimId);
    return clone(record);
  }

  reviseClaim(claimId,{
    statement,
    scope,
    qualifiers,
    reason,
    claimType
  }={}){
    const prior=this.#claims.get(claimId);
    if(!prior) throw new Error("Unknown claimId");
    if(prior.supersededBy) throw new Error("Only the latest claim revision can be revised");
    if(typeof reason!=="string"||!reason.trim()) throw new TypeError("revision reason is required");

    const immutable={
      version:"CLAIM_V0.1",
      claimKey:prior.claimKey,
      revision:prior.revision+1,
      claimType:typeof claimType==="string"&&claimType.trim()?claimType.trim():prior.claimType,
      statement:typeof statement==="string"&&statement.trim()?statement.trim():prior.statement,
      scope:scope===undefined?clone(prior.scope):normalizeScope(scope),
      qualifiers:qualifiers===undefined?[...prior.qualifiers]:cleanStrings(qualifiers),
      supersedes:prior.claimId
    };
    const nextId=fingerprint(immutable);
    const next={
      ...immutable,
      claimId:nextId,
      supersededBy:null,
      revisionReason:reason.trim()
    };

    prior.supersededBy=nextId;
    this.#claims.set(prior.claimId,prior);
    this.#claims.set(nextId,next);
    this.#claimEvidence.set(nextId,new Set());
    this.#latestByKey.set(prior.claimKey,nextId);
    return clone(next);
  }

  registerEvidence({
    claimId,
    evidenceType,
    relation,
    artifact=null,
    artifactFingerprint=null,
    sourceLabel="",
    note=""
  }){
    const claim=this.#claims.get(claimId);
    if(!claim) throw new Error("Unknown claimId");
    if(claim.supersededBy) throw new Error("Evidence must attach to the latest claim revision");
    if(!CLAIM_EVIDENCE_TYPES.includes(evidenceType)){
      throw new TypeError("Unsupported evidenceType: "+evidenceType);
    }
    if(!CLAIM_EVIDENCE_RELATIONS.includes(relation)){
      throw new TypeError("Unsupported evidence relation: "+relation);
    }

    let provenance;
    let resolvedFingerprint;
    let artifactSummary=null;

    if(artifact!==null){
      if(!verifyFingerprint(artifact)) throw new Error("Evidence artifact fingerprint mismatch");
      resolvedFingerprint=artifact.fingerprint;
      provenance="VERIFIED_ARTIFACT";
      if(evidenceType==="REPLICATION_SUMMARY"){
        const grade=artifact.evidenceGrade;
        if(!REPLICATION_EVIDENCE_GRADES.includes(grade)){
          throw new Error("Replication summary evidence grade is invalid");
        }
        artifactSummary={
          evidenceGrade:grade,
          supportRate:artifact.supportRate??null,
          divergenceRate:artifact.divergenceRate??null,
          supportReplicatorCount:artifact.supportReplicatorCount??null,
          supportEnvironmentCount:artifact.supportEnvironmentCount??null
        };
      }
    }else{
      resolvedFingerprint=sha256(artifactFingerprint,"artifactFingerprint");
      provenance="DECLARED_FINGERPRINT";
      if(evidenceType==="REPLICATION_SUMMARY"){
        throw new Error("REPLICATION_SUMMARY evidence requires the verified artifact");
      }
    }

    const existing=[...(this.#claimEvidence.get(claimId)??[])].map(id=>this.#evidence.get(id));
    const conflict=existing.find(item=>
      item.artifactFingerprint===resolvedFingerprint&&
      item.relation!==relation
    );
    if(conflict){
      throw new Error("EVIDENCE_RELATION_CONFLICT");
    }

    const body={
      version:"CLAIM_EVIDENCE_V0.1",
      claimId,
      evidenceType,
      relation,
      artifactFingerprint:resolvedFingerprint,
      provenance,
      sourceLabel:typeof sourceLabel==="string"?sourceLabel.trim():"",
      note:typeof note==="string"?note:"",
      artifactSummary
    };
    const evidenceId=fingerprint(body);
    if(this.#evidence.has(evidenceId)) throw new Error("DUPLICATE_CLAIM_EVIDENCE");

    const record={...body,evidenceId};
    this.#evidence.set(evidenceId,record);
    this.#claimEvidence.get(claimId).add(evidenceId);
    return clone(record);
  }

  claim(claimId){
    const record=this.#claims.get(claimId);
    return record?clone(record):null;
  }

  latest(claimKey){
    const id=this.#latestByKey.get(claimKey);
    return id?this.claim(id):null;
  }

  evidenceFor(claimId){
    if(!this.#claims.has(claimId)) throw new Error("Unknown claimId");
    return [...(this.#claimEvidence.get(claimId)??[])]
      .map(id=>clone(this.#evidence.get(id)))
      .sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId));
  }

  assessClaim(claimId){
    const claim=this.#claims.get(claimId);
    if(!claim) throw new Error("Unknown claimId");
    const evidence=this.evidenceFor(claimId);
    const supports=evidence.filter(item=>item.relation==="SUPPORTS");
    const contradicts=evidence.filter(item=>item.relation==="CONTRADICTS");
    const qualifies=evidence.filter(item=>item.relation==="QUALIFIES");
    const context=evidence.filter(item=>item.relation==="CONTEXT");
    const verifiedSupports=supports.filter(item=>item.provenance==="VERIFIED_ARTIFACT").length;
    const replicationGrades=supports
      .filter(item=>item.evidenceType==="REPLICATION_SUMMARY")
      .map(item=>item.artifactSummary?.evidenceGrade)
      .filter(Boolean);

    const body={
      version:"CLAIM_ASSESSMENT_V0.1",
      claimId,
      claimKey:claim.claimKey,
      revision:claim.revision,
      status:claimStatus({
        supports:supports.length,
        contradicts:contradicts.length,
        supersededBy:claim.supersededBy
      }),
      evidenceGrade:evidenceGrade({
        supports:supports.length,
        contradicts:contradicts.length,
        verifiedSupports,
        replicationGrades
      }),
      counts:{
        total:evidence.length,
        supports:supports.length,
        contradicts:contradicts.length,
        qualifies:qualifies.length,
        context:context.length,
        verifiedArtifacts:evidence.filter(item=>item.provenance==="VERIFIED_ARTIFACT").length,
        declaredFingerprints:evidence.filter(item=>item.provenance==="DECLARED_FINGERPRINT").length
      },
      strongestReplicationGrade:replicationGrades.length
        ?REPLICATION_EVIDENCE_GRADES[
          Math.max(...replicationGrades.map(value=>REPLICATION_EVIDENCE_GRADES.indexOf(value)))
        ]
        :null,
      supersededBy:claim.supersededBy,
      evidenceIds:evidence.map(item=>item.evidenceId),
      boundary:{
        evidenceGradeIsPolicySummary:true,
        causalityEstablished:false,
        scientificTruth:"NOT_ESTABLISHED"
      }
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  lineage(claimId){
    if(!this.#claims.has(claimId)) throw new Error("Unknown claimId");
    const chain=[];
    let cursor=this.#claims.get(claimId);
    while(cursor?.supersedes){
      cursor=this.#claims.get(cursor.supersedes);
    }
    if(cursor) chain.push(cursor.claimId);
    while(chain.length){
      const last=this.#claims.get(chain.at(-1));
      if(!last?.supersededBy) break;
      chain.push(last.supersededBy);
    }
    return chain.map(id=>this.claim(id));
  }

  graph(){
    const claimNodes=[...this.#claims.values()]
      .map(claim=>({
        id:claim.claimId,
        nodeType:"CLAIM",
        claimKey:claim.claimKey,
        revision:claim.revision,
        statement:claim.statement
      }))
      .sort((a,b)=>a.id.localeCompare(b.id));

    const evidenceNodes=[...this.#evidence.values()]
      .map(item=>({
        id:item.evidenceId,
        nodeType:"EVIDENCE",
        evidenceType:item.evidenceType,
        artifactFingerprint:item.artifactFingerprint,
        provenance:item.provenance
      }))
      .sort((a,b)=>a.id.localeCompare(b.id));

    const evidenceEdges=[...this.#evidence.values()]
      .map(item=>({
        from:item.evidenceId,
        to:item.claimId,
        relation:item.relation
      }));

    const supersessionEdges=[...this.#claims.values()]
      .filter(claim=>claim.supersedes)
      .map(claim=>({
        from:claim.claimId,
        to:claim.supersedes,
        relation:"SUPERSEDES"
      }));

    const edges=[...evidenceEdges,...supersessionEdges]
      .sort((a,b)=>
        a.from.localeCompare(b.from)||
        a.to.localeCompare(b.to)||
        a.relation.localeCompare(b.relation)
      );

    const body={
      version:"CLAIM_EVIDENCE_GRAPH_V0.1",
      nodes:[...claimNodes,...evidenceNodes],
      edges
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  export(){
    const claims=[...this.#claims.values()]
      .map(clone)
      .sort((a,b)=>a.claimId.localeCompare(b.claimId));
    const evidence=[...this.#evidence.values()]
      .map(clone)
      .sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId));
    const body={
      version:"CLAIM_REGISTRY_V0.1",
      claims,
      evidence
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="CLAIM_REGISTRY_V0.1") throw new TypeError("Unsupported claim registry version");
    const {fingerprint:stored,...body}=snapshot;
    if(fingerprint(body)!==stored) throw new Error("Claim registry fingerprint mismatch");

    const registry=new ClaimEvidenceRegistry();
    for(const claim of snapshot.claims??[]){
      registry.#claims.set(claim.claimId,clone(claim));
      registry.#claimEvidence.set(claim.claimId,new Set());
      const latest=registry.#latestByKey.get(claim.claimKey);
      if(!latest||registry.#claims.get(latest).revision<claim.revision){
        registry.#latestByKey.set(claim.claimKey,claim.claimId);
      }
    }
    for(const item of snapshot.evidence??[]){
      registry.#evidence.set(item.evidenceId,clone(item));
      if(!registry.#claimEvidence.has(item.claimId)){
        throw new Error("Evidence references unknown claim");
      }
      registry.#claimEvidence.get(item.claimId).add(item.evidenceId);
    }
    return registry;
  }
}

export function validateClaimRegistryConstants(){
  const errors=[];
  if(new Set(CLAIM_EVIDENCE_TYPES).size!==CLAIM_EVIDENCE_TYPES.length) errors.push("DUPLICATE_EVIDENCE_TYPE");
  if(new Set(CLAIM_EVIDENCE_RELATIONS).size!==CLAIM_EVIDENCE_RELATIONS.length) errors.push("DUPLICATE_RELATION");
  if(new Set(CLAIM_STATUSES).size!==CLAIM_STATUSES.length) errors.push("DUPLICATE_STATUS");
  if(new Set(CLAIM_EVIDENCE_GRADES).size!==CLAIM_EVIDENCE_GRADES.length) errors.push("DUPLICATE_GRADE");
  return errors;
}
