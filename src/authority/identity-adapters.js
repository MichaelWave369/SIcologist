import {
  assertConstitutionalAuthorization
} from "./ledger.js";
import {
  verifyCryptographicAuthorizationAttestation
} from "./identity.js";
import {
  activatePolicyPromotion,
  rollbackActivePolicy
} from "../portfolio/policy-lifecycle.js";

export function activatePolicyPromotionCryptographically(
  constitution,
  keyRegistry,
  attestation,
  proposal,
  governanceRegistry
){
  if(!verifyCryptographicAuthorizationAttestation(
    constitution,
    keyRegistry,
    attestation,
    {requireCurrentRegistry:true}
  )){
    throw new Error("Cryptographic authorization attestation verification failed");
  }
  assertConstitutionalAuthorization(
    constitution,
    attestation.constitutionalReceipt,
    {
      actionType:"ACTIVATE_POLICY",
      subjectFingerprint:proposal.fingerprint
    }
  );
  return activatePolicyPromotion(proposal,governanceRegistry,{
    operatorApproved:true,
    approvalReceipt:"crypto-constitutional:"+attestation.fingerprint
  });
}

export function rollbackActivePolicyCryptographically(
  constitution,
  keyRegistry,
  attestation,
  state,
  monitorReport,
  governanceRegistry,
  {rollbackReason}
){
  if(!verifyCryptographicAuthorizationAttestation(
    constitution,
    keyRegistry,
    attestation,
    {requireCurrentRegistry:true}
  )){
    throw new Error("Cryptographic authorization attestation verification failed");
  }
  assertConstitutionalAuthorization(
    constitution,
    attestation.constitutionalReceipt,
    {
      actionType:"ROLLBACK_POLICY",
      subjectFingerprint:monitorReport.fingerprint
    }
  );
  return rollbackActivePolicy(state,monitorReport,governanceRegistry,{
    operatorApproved:true,
    approvalReceipt:"crypto-constitutional:"+attestation.fingerprint,
    rollbackReason
  });
}
