export const CLAIM_CHALLENGE_OUTCOMES=Object.freeze([
  "SURVIVED_CHALLENGE",
  "WEAKENED",
  "CONTRADICTED",
  "INCONCLUSIVE"
]);

export const CLAIM_CHALLENGE_STATES=Object.freeze([
  "PREREGISTERED",
  "RESOLVED"
]);

export const CHALLENGE_OUTCOME_TO_EVIDENCE_RELATION=Object.freeze({
  SURVIVED_CHALLENGE:"SUPPORTS",
  WEAKENED:"QUALIFIES",
  CONTRADICTED:"CONTRADICTS",
  INCONCLUSIVE:"CONTEXT"
});

export function evidenceRelationForChallengeOutcome(outcome){
  const relation=CHALLENGE_OUTCOME_TO_EVIDENCE_RELATION[outcome];
  if(!relation) throw new TypeError("Unsupported challenge outcome: "+outcome);
  return relation;
}
