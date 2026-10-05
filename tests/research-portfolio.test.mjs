import test from "node:test";
import assert from "node:assert/strict";
import {
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  ResearchCampaignTracker,
  createResearchCampaignPlan,
  createResearchPortfolio,
  createPortfolioSelectionReceipt,
  portfolioRecommendation,
  verifyResearchPortfolio,
  fingerprint
} from "../src/index.js";

function artifact(body){
  return {...body,fingerprint:fingerprint(body)};
}

function programFixture(name,{
  evidence="NONE",
  campaignCost=2
}={}){
  const claims=new ClaimEvidenceRegistry();
  const target=claims.createClaim({
    claimKey:name+"_TARGET",
    statement:name+" target explanation.",
    scope:{conditionId:"SC-007"}
  });
  const rival=claims.createClaim({
    claimKey:name+"_RIVAL",
    statement:name+" rival explanation.",
    scope:{conditionId:"SC-007"}
  });

  if(evidence==="PRELIMINARY"){
    claims.registerEvidence({
      claimId:target.claimId,
      evidenceType:"EXTERNAL_REFERENCE",
      relation:"SUPPORTS",
      artifactFingerprint:"a".repeat(64)
    });
  }else if(evidence==="ROBUST"){
    claims.registerEvidence({
      claimId:target.claimId,
      evidenceType:"REPLICATION_SUMMARY",
      relation:"SUPPORTS",
      artifact:artifact({
        version:"REPLICATION_REGISTRY_SUMMARY_V0.1",
        evidenceGrade:"ROBUST_REPLICATION_CANDIDATE",
        supportRate:1,
        divergenceRate:0,
        supportReplicatorCount:5,
        supportEnvironmentCount:3
      })
    });
  }

  const plan=createResearchCampaignPlan(claims,{
    targetClaimId:target.claimId,
    rivals:[{
      rivalClaimId:rival.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-02"
    }],
    policy:{maxSteps:2,maxEstimatedCost:campaignCost},
    title:name
  });
  return {
    claims,
    challenges:new ClaimChallengeRegistry(),
    target,
    rival,
    plan,
    tracker:new ResearchCampaignTracker(plan)
  };
}

function sharedPortfolio(programs,policy={}){
  const claims=new ClaimEvidenceRegistry();
  throw new Error("unused");
}

function multiFixture(){
  const claims=new ClaimEvidenceRegistry();
  const challenges=new ClaimChallengeRegistry();

  function make(name,evidence="NONE",campaignCost=2){
    const target=claims.createClaim({
      claimKey:name+"_TARGET",
      statement:name+" target.",
      scope:{conditionId:"SC-007"}
    });
    const rival=claims.createClaim({
      claimKey:name+"_RIVAL",
      statement:name+" rival.",
      scope:{conditionId:"SC-007"}
    });
    if(evidence==="PRELIMINARY"){
      claims.registerEvidence({
        claimId:target.claimId,
        evidenceType:"EXTERNAL_REFERENCE",
        relation:"SUPPORTS",
        artifactFingerprint:fingerprint({name,evidence})
      });
    }
    if(evidence==="ROBUST"){
      claims.registerEvidence({
        claimId:target.claimId,
        evidenceType:"REPLICATION_SUMMARY",
        relation:"SUPPORTS",
        artifact:artifact({
          version:"REPLICATION_REGISTRY_SUMMARY_V0.1",
          evidenceGrade:"ROBUST_REPLICATION_CANDIDATE",
          supportRate:1,
          divergenceRate:0,
          supportReplicatorCount:5,
          supportEnvironmentCount:3,
          name
        })
      });
    }
    const plan=createResearchCampaignPlan(claims,{
      targetClaimId:target.claimId,
      rivals:[{
        rivalClaimId:rival.claimId,
        conditionId:"SC-007",
        targetHypothesisId:"H-SC-007-01",
        rivalHypothesisId:"H-SC-007-02"
      }],
      policy:{maxSteps:2,maxEstimatedCost:campaignCost},
      title:name
    });
    return {target,rival,plan,tracker:new ResearchCampaignTracker(plan)};
  }

  return {
    claims,
    challenges,
    a:make("A","NONE"),
    b:make("B","PRELIMINARY"),
    c:make("C","ROBUST")
  };
}

test("portfolio is deterministic and fingerprinted",()=>{
  const base=multiFixture();
  const input=[
    {programId:"a",tracker:base.a.tracker,operatorImportance:.5},
    {programId:"b",tracker:base.b.tracker,operatorImportance:.5}
  ];
  const p1=createResearchPortfolio(base.claims,base.challenges,{programs:input});
  const p2=createResearchPortfolio(base.claims,base.challenges,{programs:input});
  assert.equal(verifyResearchPortfolio(p1),true);
  assert.deepEqual(p1,p2);
  assert.equal(p1.boundaries.portfolioExecutesNothing,true);
});

test("higher operator importance breaks otherwise equal program priority",()=>{
  const base=multiFixture();
  const dTarget=base.claims.createClaim({
    claimKey:"D_TARGET",
    statement:"D target.",
    scope:{conditionId:"SC-007"}
  });
  const dRival=base.claims.createClaim({
    claimKey:"D_RIVAL",
    statement:"D rival.",
    scope:{conditionId:"SC-007"}
  });
  const dPlan=createResearchCampaignPlan(base.claims,{
    targetClaimId:dTarget.claimId,
    rivals:[{
      rivalClaimId:dRival.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-02"
    }]
  });
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"low",tracker:base.a.tracker,operatorImportance:.1},
      {programId:"high",tracker:new ResearchCampaignTracker(dPlan),operatorImportance:.9}
    ]
  });
  assert.equal(portfolio.allocation.allocations[0].programId,"high");
});

test("robust replication reduces research need relative to no evidence",()=>{
  const base=multiFixture();
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"none",tracker:base.a.tracker,operatorImportance:.5},
      {programId:"robust",tracker:base.c.tracker,operatorImportance:.5}
    ]
  });
  const none=portfolio.programs.find(x=>x.programId==="none");
  const robust=portfolio.programs.find(x=>x.programId==="robust");
  assert.ok(none.components.evidenceWeakness>robust.components.evidenceWeakness);
  assert.ok(none.components.replicationNeed>robust.components.replicationNeed);
  assert.ok(none.priorityScore>robust.priorityScore);
});

test("campaign not ready for selection is ineligible regardless of importance",()=>{
  const base=multiFixture();
  base.b.tracker.selectNext({
    claimRegistry:base.claims,
    challengeRegistry:base.challenges,
    operatorApproved:true,
    approvalReceipt:"operator:b"
  });
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"ready",tracker:base.a.tracker,operatorImportance:.1},
      {programId:"waiting",tracker:base.b.tracker,operatorImportance:1}
    ]
  });
  const waiting=portfolio.programs.find(x=>x.programId==="waiting");
  assert.equal(waiting.eligibleForAllocation,false);
  assert.equal(waiting.campaignGateDecision,"WAIT_CHALLENGE_RESULT");
  assert.equal(
    portfolio.allocation.allocations.some(x=>x.programId==="waiting"),
    false
  );
});

test("allocation count limit leaves lower-ranked programs visible",()=>{
  const base=multiFixture();
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"a",tracker:base.a.tracker,operatorImportance:.9},
      {programId:"b",tracker:base.b.tracker,operatorImportance:.5},
      {programId:"c",tracker:base.c.tracker,operatorImportance:.1}
    ],
    policy:{maxAllocatedCampaigns:1,maxEstimatedCost:10}
  });
  assert.equal(portfolio.allocation.allocatedCount,1);
  assert.equal(
    portfolio.allocation.unallocated.filter(x=>x.reason==="ALLOCATION_COUNT_LIMIT").length,
    2
  );
});

test("shared cost budget is never exceeded",()=>{
  const base=multiFixture();
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"a",tracker:base.a.tracker,operatorImportance:.9},
      {programId:"b",tracker:base.b.tracker,operatorImportance:.8},
      {programId:"c",tracker:base.c.tracker,operatorImportance:.7}
    ],
    policy:{maxAllocatedCampaigns:5,maxEstimatedCost:.45}
  });
  assert.ok(portfolio.allocation.allocatedEstimatedCost<=.45);
  assert.ok(portfolio.allocation.unallocated.some(x=>x.reason==="PORTFOLIO_COST_LIMIT"));
});

test("duplicate program id tracker and plan are rejected",()=>{
  const base=multiFixture();
  assert.throws(()=>createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"x",tracker:base.a.tracker},
      {programId:"x",tracker:base.b.tracker}
    ]
  }),/Duplicate programId/);

  assert.throws(()=>createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"x",tracker:base.a.tracker},
      {programId:"y",tracker:base.a.tracker}
    ]
  }),/Duplicate campaign tracker/);

  const cloneTracker=ResearchCampaignTracker.fromSnapshot(base.a.tracker.export());
  assert.throws(()=>createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"x",tracker:base.a.tracker},
      {programId:"y",tracker:cloneTracker}
    ]
  }),/Duplicate campaign tracker/);
});

test("portfolio recommendation returns only allocated programs",()=>{
  const base=multiFixture();
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[
      {programId:"a",tracker:base.a.tracker,operatorImportance:.9},
      {programId:"b",tracker:base.b.tracker,operatorImportance:.1}
    ],
    policy:{maxAllocatedCampaigns:1,maxEstimatedCost:10}
  });
  const allocated=portfolio.allocation.allocations[0].programId;
  const other=allocated==="a"?"b":"a";
  assert.ok(portfolioRecommendation(portfolio,allocated));
  assert.equal(portfolioRecommendation(portfolio,other),null);
});

test("portfolio selection requires operator approval and never authorizes experiment execution",()=>{
  const base=multiFixture();
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[{programId:"a",tracker:base.a.tracker,operatorImportance:.5}]
  });

  assert.throws(()=>createPortfolioSelectionReceipt(portfolio,"a"),/Operator approval/);

  const receipt=createPortfolioSelectionReceipt(portfolio,"a",{
    operatorApproved:true,
    approvalReceipt:"operator:portfolio:a"
  });
  assert.equal(receipt.campaignSelectionAuthorized,true);
  assert.equal(receipt.experimentExecutionAuthorized,false);
});

test("tampered portfolio cannot issue a selection receipt",()=>{
  const base=multiFixture();
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[{programId:"a",tracker:base.a.tracker,operatorImportance:.5}]
  });
  portfolio.programs[0].priorityScore=1;
  assert.throws(()=>createPortfolioSelectionReceipt(portfolio,"a",{
    operatorApproved:true,
    approvalReceipt:"operator:tamper"
  }),/fingerprint mismatch/);
});

test("invalid portfolio weights are rejected",()=>{
  const base=multiFixture();
  assert.throws(()=>createResearchPortfolio(base.claims,base.challenges,{
    programs:[{programId:"a",tracker:base.a.tracker}],
    policy:{
      weights:{
        informationOpportunity:.5,
        evidenceWeakness:.5,
        replicationNeed:.5,
        operatorImportance:0,
        costEfficiency:0
      }
    }
  }),/sum to 1/);
});

test("empty-step campaign stays visible but receives no allocation",()=>{
  const base=multiFixture();
  const target=base.claims.createClaim({
    claimKey:"EMPTY_TARGET",
    statement:"Empty target.",
    scope:{conditionId:"SC-007"}
  });
  const rival=base.claims.createClaim({
    claimKey:"EMPTY_RIVAL",
    statement:"Empty rival.",
    scope:{conditionId:"SC-007"}
  });
  const plan=createResearchCampaignPlan(base.claims,{
    targetClaimId:target.claimId,
    rivals:[{
      rivalClaimId:rival.claimId,
      conditionId:"SC-007",
      targetHypothesisId:"H-SC-007-01",
      rivalHypothesisId:"H-SC-007-02"
    }],
    policy:{maxSteps:2,maxEstimatedCost:.01}
  });
  const portfolio=createResearchPortfolio(base.claims,base.challenges,{
    programs:[{programId:"empty",tracker:new ResearchCampaignTracker(plan),operatorImportance:1}]
  });
  assert.equal(portfolio.programs[0].campaignGateDecision,"STOP_NO_PLANNED_STEPS");
  assert.equal(portfolio.allocation.allocatedCount,0);
});
