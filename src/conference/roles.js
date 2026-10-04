export const CASE_CONFERENCE_ROLES=Object.freeze([
  "OBSERVER",
  "VERIFIER",
  "CHALLENGER",
  "HISTORIAN",
  "INTERVENTION_SPECIALIST",
  "GOVERNANCE_AUDITOR"
]);

const ROLE_SET=new Set(CASE_CONFERENCE_ROLES);

export function validateConferenceRole(role){
  if(!ROLE_SET.has(role)) throw new TypeError(`Unsupported conference role: ${role}`);
  return role;
}
