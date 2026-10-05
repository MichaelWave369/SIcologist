export const PORTFOLIO_VERSION="RESEARCH_PORTFOLIO_V0.1";

export const DEFAULT_PORTFOLIO_WEIGHTS=Object.freeze({
  informationOpportunity:.30,
  evidenceWeakness:.25,
  replicationNeed:.20,
  operatorImportance:.15,
  costEfficiency:.10
});

export const DEFAULT_PORTFOLIO_POLICY=Object.freeze({
  maxAllocatedCampaigns:5,
  maxEstimatedCost:2,
  allocationStrategy:"PRIORITY_THEN_COST_FIT",
  weights:DEFAULT_PORTFOLIO_WEIGHTS
});

export const EVIDENCE_WEAKNESS=Object.freeze({
  NO_EVIDENCE:1,
  PRELIMINARY_SUPPORT:.9,
  MULTI_SOURCE_SUPPORT:.65,
  REPLICATION_SUPPORT:.4,
  ROBUST_REPLICATION_CANDIDATE:.1,
  CONTESTED_EVIDENCE:1,
  ADVERSE_EVIDENCE_ONLY:1
});

export const REPLICATION_NEED=Object.freeze({
  NONE:1,
  SINGLE_REPLICATION_SUPPORT:.8,
  MULTI_REPLICATOR_SUPPORT:.6,
  CROSS_ENVIRONMENT_SUPPORT:.3,
  ROBUST_REPLICATION_CANDIDATE:.05
});

function inUnit(value,name){
  if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1){
    throw new TypeError(name+" must be in [0,1]");
  }
  return value;
}

export function validatePortfolioWeights(weights){
  const keys=[
    "informationOpportunity",
    "evidenceWeakness",
    "replicationNeed",
    "operatorImportance",
    "costEfficiency"
  ];
  let total=0;
  for(const key of keys){
    total+=inUnit(weights?.[key],"Portfolio weight "+key);
  }
  if(Math.abs(total-1)>1e-9) throw new Error("Portfolio weights must sum to 1");
  return Object.freeze({...weights});
}

export function normalizePortfolioPolicy(policy={}){
  const weights=validatePortfolioWeights({
    ...DEFAULT_PORTFOLIO_WEIGHTS,
    ...(policy.weights??{})
  });
  const resolved={
    ...DEFAULT_PORTFOLIO_POLICY,
    ...policy,
    weights
  };
  if(!Number.isInteger(resolved.maxAllocatedCampaigns)||resolved.maxAllocatedCampaigns<1){
    throw new TypeError("maxAllocatedCampaigns must be an integer >= 1");
  }
  if(
    typeof resolved.maxEstimatedCost!=="number"||
    !Number.isFinite(resolved.maxEstimatedCost)||
    resolved.maxEstimatedCost<=0
  ){
    throw new TypeError("maxEstimatedCost must be > 0");
  }
  if(resolved.allocationStrategy!=="PRIORITY_THEN_COST_FIT"){
    throw new TypeError("Unsupported allocationStrategy");
  }
  return Object.freeze({...resolved,weights});
}

export function evidenceWeaknessForGrade(grade){
  const value=EVIDENCE_WEAKNESS[grade];
  if(typeof value!=="number") throw new Error("Unknown claim evidence grade: "+grade);
  return value;
}

export function replicationNeedForGrade(grade){
  if(grade===null||grade===undefined) return REPLICATION_NEED.NONE;
  const value=REPLICATION_NEED[grade];
  if(typeof value!=="number") throw new Error("Unknown replication evidence grade: "+grade);
  return value;
}
