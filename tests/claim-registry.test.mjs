import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  fingerprint
} from "../src/index.js";

function verifiedArtifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

function replicationSummary(grade){
  return verifiedArtifact({
    version:"REPLICATION_REGISTRY_SUMMARY_V0.1",
    evidenceGrade:grade,
    supportRate:1,
    divergenceRate:0,
    supportReplicatorCount:5,
    supportEnvironmentCount:3
  });
}

test("new claim starts unassessed with no evidence",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({
    claimKey:"SC007.RETRY.EXPLANATION",
    statement:"A retry spiral is best explained by recoverable tool instability.",
    scope:{conditionId:"SC-007"}
  });
  const assessment=registry.assessClaim(claim.claimId);
  assert.equal(assessment.status,"UNASSESSED");
  assert.equal(assessment.evidenceGrade,"NO_EVIDENCE");
  assert.equal(assessment.boundary.scientificTruth,"NOT_ESTABLISHED");
});

test("claim keys cannot be silently reused",()=>{
  const registry=new ClaimEvidenceRegistry();
  registry.createClaim({claimKey:"C-1",statement:"first"});
  assert.throws(
    ()=>registry.createClaim({claimKey:"C-1",statement:"changed"}),
    /revise/
  );
});

test("declared fingerprint support is preliminary",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-2",statement:"candidate claim"});
  registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"EXTERNAL_REFERENCE",
    relation:"SUPPORTS",
    artifactFingerprint:"a".repeat(64)
  });
  const assessment=registry.assessClaim(claim.claimId);
  assert.equal(assessment.status,"SUPPORT_ONLY");
  assert.equal(assessment.evidenceGrade,"PRELIMINARY_SUPPORT");
  assert.equal(assessment.counts.declaredFingerprints,1);
});

test("two verified support artifacts become multi-source support",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-3",statement:"multi-source claim"});
  for(const i of [1,2]){
    registry.registerEvidence({
      claimId:claim.claimId,
      evidenceType:"BENCHMARK_REPORT",
      relation:"SUPPORTS",
      artifact:verifiedArtifact({kind:"benchmark",run:i})
    });
  }
  const assessment=registry.assessClaim(claim.claimId);
  assert.equal(assessment.evidenceGrade,"MULTI_SOURCE_SUPPORT");
  assert.equal(assessment.counts.verifiedArtifacts,2);
});

test("verified replication summary can raise engineering evidence grade",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-4",statement:"replicated claim"});
  registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"REPLICATION_SUMMARY",
    relation:"SUPPORTS",
    artifact:replicationSummary("ROBUST_REPLICATION_CANDIDATE")
  });
  const assessment=registry.assessClaim(claim.claimId);
  assert.equal(assessment.status,"SUPPORT_ONLY");
  assert.equal(assessment.evidenceGrade,"ROBUST_REPLICATION_CANDIDATE");
  assert.equal(assessment.strongestReplicationGrade,"ROBUST_REPLICATION_CANDIDATE");
  assert.equal(assessment.boundary.causalityEstablished,false);
});

test("contradictory evidence makes a supported claim contested",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-5",statement:"contested claim"});
  registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"REPLICATION_SUMMARY",
    relation:"SUPPORTS",
    artifact:replicationSummary("ROBUST_REPLICATION_CANDIDATE")
  });
  registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"PROBE_RESULT",
    relation:"CONTRADICTS",
    artifact:verifiedArtifact({kind:"probe",result:"counterexample"})
  });
  const assessment=registry.assessClaim(claim.claimId);
  assert.equal(assessment.status,"CONTESTED");
  assert.equal(assessment.evidenceGrade,"CONTESTED_EVIDENCE");
});

test("adverse-only evidence yields contradicted status",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-6",statement:"unsupported claim"});
  registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"EVALUATION_RECEIPT",
    relation:"CONTRADICTS",
    artifact:verifiedArtifact({kind:"evaluation",result:"failed"})
  });
  const assessment=registry.assessClaim(claim.claimId);
  assert.equal(assessment.status,"CONTRADICTED");
  assert.equal(assessment.evidenceGrade,"ADVERSE_EVIDENCE_ONLY");
});

test("same artifact cannot be assigned conflicting relations to one claim",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-7",statement:"relation conflict"});
  const artifact=verifiedArtifact({kind:"case",id:7});
  registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"CASE_FILE",
    relation:"SUPPORTS",
    artifact
  });
  assert.throws(()=>registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"CASE_FILE",
    relation:"CONTRADICTS",
    artifact
  }),/EVIDENCE_RELATION_CONFLICT/);
});

test("tampered evidence artifact is rejected",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-8",statement:"tamper test"});
  const artifact=verifiedArtifact({kind:"probe",value:1});
  artifact.value=2;
  assert.throws(()=>registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"PROBE_RESULT",
    relation:"SUPPORTS",
    artifact
  }),/fingerprint mismatch/);
});

test("claim revision supersedes old wording without inheriting evidence",()=>{
  const registry=new ClaimEvidenceRegistry();
  const first=registry.createClaim({
    claimKey:"C-9",
    statement:"Broad claim",
    scope:{taskClass:"all"}
  });
  registry.registerEvidence({
    claimId:first.claimId,
    evidenceType:"CASE_FILE",
    relation:"SUPPORTS",
    artifact:verifiedArtifact({case:"one"})
  });

  const second=registry.reviseClaim(first.claimId,{
    statement:"Narrow claim",
    scope:{taskClass:"browser-retry"},
    reason:"Evidence only supports the narrower scope"
  });

  assert.equal(registry.assessClaim(first.claimId).status,"SUPERSEDED");
  assert.equal(registry.assessClaim(second.claimId).status,"UNASSESSED");
  assert.equal(registry.evidenceFor(second.claimId).length,0);
  assert.deepEqual(
    registry.lineage(second.claimId).map(item=>item.claimId),
    [first.claimId,second.claimId]
  );
  assert.throws(()=>registry.registerEvidence({
    claimId:first.claimId,
    evidenceType:"EXTERNAL_REFERENCE",
    relation:"SUPPORTS",
    artifactFingerprint:"b".repeat(64)
  }),/latest claim revision/);
});

test("evidence graph exposes support and supersession edges",()=>{
  const registry=new ClaimEvidenceRegistry();
  const first=registry.createClaim({claimKey:"C-10",statement:"v1"});
  const evidence=registry.registerEvidence({
    claimId:first.claimId,
    evidenceType:"CONFERENCE_REPORT",
    relation:"QUALIFIES",
    artifact:verifiedArtifact({conference:"one"})
  });
  const second=registry.reviseClaim(first.claimId,{
    statement:"v2",
    reason:"qualification changed wording"
  });

  const graph=registry.graph();
  assert.ok(graph.nodes.some(node=>node.id===first.claimId&&node.nodeType==="CLAIM"));
  assert.ok(graph.nodes.some(node=>node.id===evidence.evidenceId&&node.nodeType==="EVIDENCE"));
  assert.ok(graph.edges.some(edge=>
    edge.from===evidence.evidenceId&&edge.to===first.claimId&&edge.relation==="QUALIFIES"
  ));
  assert.ok(graph.edges.some(edge=>
    edge.from===second.claimId&&edge.to===first.claimId&&edge.relation==="SUPERSEDES"
  ));
});

test("registry export and restore preserve deterministic graph and assessments",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({
    claimKey:"C-11",
    statement:"restorable claim",
    qualifiers:["synthetic only"]
  });
  registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"BENCHMARK_REPORT",
    relation:"SUPPORTS",
    artifact:verifiedArtifact({benchmark:"frozen"})
  });

  const snapshot=registry.export();
  const restored=ClaimEvidenceRegistry.fromSnapshot(snapshot);
  assert.deepEqual(restored.export(),snapshot);
  assert.deepEqual(restored.graph(),registry.graph());
  assert.deepEqual(restored.assessClaim(claim.claimId),registry.assessClaim(claim.claimId));
});

test("replication summary must be a verified artifact",()=>{
  const registry=new ClaimEvidenceRegistry();
  const claim=registry.createClaim({claimKey:"C-12",statement:"replication-grade claim"});
  assert.throws(()=>registry.registerEvidence({
    claimId:claim.claimId,
    evidenceType:"REPLICATION_SUMMARY",
    relation:"SUPPORTS",
    artifactFingerprint:"c".repeat(64)
  }),/verified artifact/);
});
