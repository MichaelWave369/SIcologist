import {
  ClaimEvidenceRegistry,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

const claims=new ClaimEvidenceRegistry();

const claim=claims.createClaim({
  claimKey:"SC007.RETRY.CAUSE.CANDIDATE",
  claimType:"EXPLANATORY",
  statement:"For the tested SC-007 scope, recoverable tool instability is the best-supported explanation.",
  scope:{
    conditionId:"SC-007",
    taskClass:"browser-tool-retry"
  },
  qualifiers:[
    "engineering claim",
    "causality not established"
  ]
});

claims.registerEvidence({
  claimId:claim.claimId,
  evidenceType:"REPLICATION_SUMMARY",
  relation:"SUPPORTS",
  artifact:artifact({
    version:"REPLICATION_REGISTRY_SUMMARY_V0.1",
    evidenceGrade:"CROSS_ENVIRONMENT_SUPPORT",
    supportRate:.8,
    divergenceRate:.2,
    supportReplicatorCount:4,
    supportEnvironmentCount:3
  }),
  sourceLabel:"Rung 13 registry summary"
});

claims.registerEvidence({
  claimId:claim.claimId,
  evidenceType:"PROBE_RESULT",
  relation:"QUALIFIES",
  artifact:artifact({
    probeId:"known_good_fixture",
    note:"result applies only to the frozen task scope"
  })
});

console.log(JSON.stringify({
  claim:claims.claim(claim.claimId),
  assessment:claims.assessClaim(claim.claimId),
  graph:claims.graph()
},null,2));
