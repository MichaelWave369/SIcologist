import {sign,verify} from "node:crypto";
import {canonicalize,fingerprint} from "../experiment/fingerprint.js";

function payloadBytes(payload){
  return Buffer.from(JSON.stringify(canonicalize(payload)),"utf8");
}

export function evaluatorPublicKeyFingerprint(publicKeyPem){
  if(typeof publicKeyPem!=="string"||!publicKeyPem.trim()){
    throw new TypeError("publicKeyPem is required");
  }
  return fingerprint({kind:"Ed25519PublicKey",pem:publicKeyPem.trim()});
}

export function signEvaluatorReceipt(receipt,{
  evaluatorId,
  privateKeyPem,
  publicKeyPem
}){
  if(typeof receipt?.fingerprint!=="string") throw new TypeError("receipt fingerprint is required");
  if(typeof evaluatorId!=="string"||!evaluatorId.trim()) throw new TypeError("evaluatorId is required");
  if(typeof privateKeyPem!=="string"||!privateKeyPem.trim()) throw new TypeError("privateKeyPem is required");

  const payload={
    version:"EVALUATOR_SIGNATURE_V0.1",
    evaluatorId:evaluatorId.trim(),
    receiptFingerprint:receipt.fingerprint,
    publicKeyFingerprint:evaluatorPublicKeyFingerprint(publicKeyPem),
    identityAssurance:"PUBLIC_KEY_ONLY"
  };

  const signature=sign(
    null,
    payloadBytes(payload),
    privateKeyPem
  ).toString("base64");

  return {
    ...payload,
    algorithm:"Ed25519",
    signature
  };
}

export function verifyEvaluatorSignature(receipt,signatureEnvelope,publicKeyPem){
  try{
    if(signatureEnvelope?.algorithm!=="Ed25519") return false;
    if(signatureEnvelope?.receiptFingerprint!==receipt?.fingerprint) return false;
    if(signatureEnvelope?.publicKeyFingerprint!==evaluatorPublicKeyFingerprint(publicKeyPem)) return false;

    const payload={
      version:signatureEnvelope.version,
      evaluatorId:signatureEnvelope.evaluatorId,
      receiptFingerprint:signatureEnvelope.receiptFingerprint,
      publicKeyFingerprint:signatureEnvelope.publicKeyFingerprint,
      identityAssurance:signatureEnvelope.identityAssurance
    };

    return verify(
      null,
      payloadBytes(payload),
      publicKeyPem,
      Buffer.from(signatureEnvelope.signature,"base64")
    );
  }catch{
    return false;
  }
}
