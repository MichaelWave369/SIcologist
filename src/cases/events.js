export const CASE_EVENT_TYPES=Object.freeze([
  "CASE_OPENED",
  "ASSESSMENT_RECORDED",
  "PROFILE_COMPARISON_RECORDED",
  "DIFFERENTIAL_RECORDED",
  "CONFERENCE_RECORDED",
  "PROBE_RECORDED",
  "INTERVENTION_PLANNED",
  "INTERVENTION_APPLIED",
  "RECOVERY_RECORDED",
  "NOTE_ADDED",
  "CASE_CLOSED",
  "CASE_REOPENED"
]);

const TYPES=new Set(CASE_EVENT_TYPES);

export function validateCaseEventType(type){
  if(!TYPES.has(type)) throw new TypeError(`Unsupported case event type: ${type}`);
  return type;
}
