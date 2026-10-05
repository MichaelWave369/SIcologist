export const PORTFOLIO_GOVERNANCE_VERSION="PORTFOLIO_GOVERNANCE_V0.1";

export const DEFAULT_PORTFOLIO_GOVERNANCE_POLICY=Object.freeze({
  minCompletedForRateReview:3,
  maxInconclusiveRate:.50,
  maxContradictionRate:.50
});

export const GOVERNANCE_REVIEW_FLAGS=Object.freeze([
  "PENDING_OUTCOMES_PRESENT",
  "HIGH_INCONCLUSIVE_RATE",
  "HIGH_CONTRADICTION_RATE"
]);

export function normalizePortfolioGovernancePolicy(policy={}){
  const resolved={...DEFAULT_PORTFOLIO_GOVERNANCE_POLICY,...policy};
  if(!Number.isInteger(resolved.minCompletedForRateReview)||resolved.minCompletedForRateReview<1){
    throw new TypeError("minCompletedForRateReview must be an integer >= 1");
  }
  for(const key of ["maxInconclusiveRate","maxContradictionRate"]){
    const value=resolved[key];
    if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1){
      throw new TypeError(key+" must be in [0,1]");
    }
  }
  return Object.freeze({...resolved});
}
