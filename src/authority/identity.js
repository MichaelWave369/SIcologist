import {createPublicKey,sign,verify} from "node:crypto";
import {canonicalize,fingerprint} from "../experiment/fingerprint.js";
import {
  verifyPolicyConstitution,
  verifyConstitutionalAuthorizationReceipt
} from "../index.js";

export const PRINCIPAL_KEY_REGISTRY_VERSION="PRINCIPAL_KEY_REGISTRY_V0.1";
export const SIGNED_PRINCIPAL_APPROVAL_VERSION="SIGNED_PRINCIPAL_APPROVAL_V0.1";
export const CRYPTOGRAPHIC_AUTHORIZATION_ATTESTATION_VERSION="CRYPTOGRAPHIC_AUTHORIZATION_ATTESTATION_V0.1";

function clone(value){ return structuredClone(value); }

function payloadBytes(payload){
  return Buffer.from(JSON.stringify(canonicalize(payload)),"utf8");
}

function cleanString(value,name){
  if(typeof value!=="string"||!value.trim()) throw new TypeError(name+" is required");
  return value.trim();
}

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function assertEd25519PublicKey(publicKeyPem){
  const pem=cleanString(publicKeyPem,"publicKeyPem");
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=="ed25519"){
    throw new TypeError("publicKeyPem must be an Ed25519 public key");
  }
  return pem;
}

export function principalPublicKeyFingerprint(publicKeyPem){
  const pem=assertEd25519PublicKey(publicKeyPem);
  return fingerprint({kind:"Ed25519PublicKey",pem});
}

function signPayload(payload,privateKeyPem){
  const key=cleanString(privateKeyPem,"privateKeyPem");
  return sign(null,payloadBytes(payload),key).toString("base64");
}

function verifyPayload(payload,signature,publicKeyPem){
  try{
    return verify(
      null,
      payloadBytes(payload),
      publicKeyPem,
      Buffer.from(signature,"base64")
    );
  }catch{
    return false;
  }
}

function eventFingerprintBody(event){
  const {fingerprint:stored,...body}=event;
  return body;
}

function principalExists(constitution,principalId){
  const principal=constitution.principals.find(item=>item.principalId===principalId);
  if(!principal) throw new Error("Unknown constitutional principal: "+principalId);
  if(principal.status!=="ACTIVE") throw new Error("Constitutional principal is not active: "+principalId);
  return principal;
}

function keyStatusAt(record,sequence){
  if(sequence<record.enrolledAtSequence) return "NOT_YET_ENROLLED";
  if(record.revokedAtSequence!==null&&sequence>=record.revokedAtSequence) return "REVOKED";
  if(record.retiredAtSequence!==null&&sequence>=record.retiredAtSequence) return "RETIRED";
  return "ACTIVE";
}

function replayEvents(constitution,events,throughSequence=events.length){
  const state=new Map();
  let previous=null;
  for(let index=0;index<throughSequence;index++){
    const event=events[index];
    if(!verifyFingerprint(event)) throw new Error("Principal key event fingerprint mismatch");
    if(event.sequence!==index+1) throw new Error("Principal key event sequence is not contiguous");
    if(event.previousEventFingerprint!==previous){
      throw new Error("Principal key event chain mismatch");
    }
    principalExists(constitution,event.principalId);

    if(event.type==="ENROLL"){
      if(state.has(event.keyId)) throw new Error("Duplicate keyId in key registry history");
      const payload={
        version:"PRINCIPAL_KEY_ENROLLMENT_V0.1",
        registryId:event.registryId,
        constitutionFingerprint:event.constitutionFingerprint,
        sequence:event.sequence,
        principalId:event.principalId,
        keyId:event.keyId,
        generation:event.generation,
        publicKeyFingerprint:event.publicKeyFingerprint,
        bootstrapReceiptFingerprint:event.bootstrapReceiptFingerprint
      };
      if(event.publicKeyFingerprint!==principalPublicKeyFingerprint(event.publicKeyPem)){
        throw new Error("Principal key fingerprint mismatch");
      }
      if(!verifyPayload(payload,event.proofOfPossession,event.publicKeyPem)){
        throw new Error("Principal key enrollment proof failed");
      }
      state.set(event.keyId,{
        principalId:event.principalId,
        keyId:event.keyId,
        generation:event.generation,
        publicKeyPem:event.publicKeyPem,
        publicKeyFingerprint:event.publicKeyFingerprint,
        enrolledAtSequence:event.sequence,
        retiredAtSequence:null,
        revokedAtSequence:null,
        enrollmentEventFingerprint:event.fingerprint
      });
    }else if(event.type==="ROTATE"){
      const oldKey=state.get(event.oldKeyId);
      if(!oldKey||oldKey.principalId!==event.principalId){
        throw new Error("Rotation old key is unavailable");
      }
      if(keyStatusAt(oldKey,event.sequence-1)!=="ACTIVE"){
        throw new Error("Rotation old key was not active");
      }
      if(state.has(event.newKeyId)) throw new Error("Rotation new keyId already exists");
      const payload={
        version:"PRINCIPAL_KEY_ROTATION_V0.1",
        registryId:event.registryId,
        constitutionFingerprint:event.constitutionFingerprint,
        sequence:event.sequence,
        principalId:event.principalId,
        oldKeyId:event.oldKeyId,
        oldPublicKeyFingerprint:oldKey.publicKeyFingerprint,
        newKeyId:event.newKeyId,
        newGeneration:event.newGeneration,
        newPublicKeyFingerprint:event.newPublicKeyFingerprint,
        reason:event.reason
      };
      if(event.newPublicKeyFingerprint!==principalPublicKeyFingerprint(event.newPublicKeyPem)){
        throw new Error("Rotation new-key fingerprint mismatch");
      }
      if(!verifyPayload(payload,event.oldKeySignature,oldKey.publicKeyPem)){
        throw new Error("Rotation old-key signature failed");
      }
      if(!verifyPayload(payload,event.newKeyProof,event.newPublicKeyPem)){
        throw new Error("Rotation new-key proof failed");
      }
      oldKey.retiredAtSequence=event.sequence;
      state.set(event.newKeyId,{
        principalId:event.principalId,
        keyId:event.newKeyId,
        generation:event.newGeneration,
        publicKeyPem:event.newPublicKeyPem,
        publicKeyFingerprint:event.newPublicKeyFingerprint,
        enrolledAtSequence:event.sequence,
        retiredAtSequence:null,
        revokedAtSequence:null,
        enrollmentEventFingerprint:event.fingerprint
      });
    }else if(event.type==="REVOKE"){
      const target=state.get(event.targetKeyId);
      const authorizer=state.get(event.authorizerKeyId);
      if(!target||target.principalId!==event.principalId) throw new Error("Revocation target key is unavailable");
      if(!authorizer||authorizer.principalId!==event.principalId) throw new Error("Revocation authorizer key is unavailable");
      if(event.targetKeyId===event.authorizerKeyId) throw new Error("Revocation requires a distinct authorizer key");
      if(keyStatusAt(target,event.sequence-1)!=="ACTIVE") throw new Error("Revocation target key was not active");
      if(keyStatusAt(authorizer,event.sequence-1)!=="ACTIVE") throw new Error("Revocation authorizer key was not active");
      const payload={
        version:"PRINCIPAL_KEY_REVOCATION_V0.1",
        registryId:event.registryId,
        constitutionFingerprint:event.constitutionFingerprint,
        sequence:event.sequence,
        principalId:event.principalId,
        targetKeyId:event.targetKeyId,
        targetPublicKeyFingerprint:target.publicKeyFingerprint,
        authorizerKeyId:event.authorizerKeyId,
        authorizerPublicKeyFingerprint:authorizer.publicKeyFingerprint,
        reason:event.reason
      };
      if(!verifyPayload(payload,event.authorizerSignature,authorizer.publicKeyPem)){
        throw new Error("Revocation authorizer signature failed");
      }
      target.revokedAtSequence=event.sequence;
    }else if(event.type==="RECOVER"){
      if(state.has(event.newKeyId)) throw new Error("Recovery new keyId already exists");
      const payload={
        version:"PRINCIPAL_KEY_RECOVERY_V0.1",
        registryId:event.registryId,
        constitutionFingerprint:event.constitutionFingerprint,
        sequence:event.sequence,
        principalId:event.principalId,
        newKeyId:event.newKeyId,
        newGeneration:event.newGeneration,
        newPublicKeyFingerprint:event.newPublicKeyFingerprint,
        recoveryReceiptFingerprint:event.recoveryReceiptFingerprint,
        reason:event.reason
      };
      if(event.newPublicKeyFingerprint!==principalPublicKeyFingerprint(event.newPublicKeyPem)){
        throw new Error("Recovery new-key fingerprint mismatch");
      }
      if(!verifyPayload(payload,event.newKeyProof,event.newPublicKeyPem)){
        throw new Error("Recovery new-key proof failed");
      }
      for(const record of state.values()){
        if(record.principalId===event.principalId&&keyStatusAt(record,event.sequence-1)==="ACTIVE"){
          record.revokedAtSequence=event.sequence;
        }
      }
      state.set(event.newKeyId,{
        principalId:event.principalId,
        keyId:event.newKeyId,
        generation:event.newGeneration,
        publicKeyPem:event.newPublicKeyPem,
        publicKeyFingerprint:event.newPublicKeyFingerprint,
        enrolledAtSequence:event.sequence,
        retiredAtSequence:null,
        revokedAtSequence:null,
        enrollmentEventFingerprint:event.fingerprint
      });
    }else{
      throw new Error("Unsupported principal key event type: "+event.type);
    }
    previous=event.fingerprint;
  }
  return state;
}

export class PrincipalKeyRegistry{
  #constitution;
  #registryId;
  #events=[];

  constructor(constitution,{registryId="sicologist-principal-keys"}={}){
    if(!verifyPolicyConstitution(constitution)) throw new Error("Policy constitution fingerprint mismatch");
    this.#constitution=clone(constitution);
    this.#registryId=cleanString(registryId,"registryId");
  }

  constitution(){ return clone(this.#constitution); }
  registryId(){ return this.#registryId; }
  sequence(){ return this.#events.length; }

  events(){
    return this.#events.map(clone);
  }

  stateAt(sequence=this.sequence()){
    if(!Number.isInteger(sequence)||sequence<0||sequence>this.sequence()){
      throw new TypeError("sequence is outside registry history");
    }
    const state=replayEvents(this.#constitution,this.#events,sequence);
    return [...state.values()].map(record=>({
      ...clone(record),
      status:keyStatusAt(record,sequence)
    })).sort((a,b)=>
      a.principalId.localeCompare(b.principalId)||
      a.generation-b.generation||
      a.keyId.localeCompare(b.keyId)
    );
  }

  snapshotAt(sequence=this.sequence()){
    const events=this.#events.slice(0,sequence).map(clone);
    const body={
      version:PRINCIPAL_KEY_REGISTRY_VERSION,
      registryId:this.#registryId,
      constitutionFingerprint:this.#constitution.fingerprint,
      sequence,
      events
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  key(principalId,keyId,{sequence=this.sequence()}={}){
    return this.stateAt(sequence).find(item=>
      item.principalId===principalId&&item.keyId===keyId
    )??null;
  }

  activeKeys(principalId){
    return this.stateAt().filter(item=>
      item.principalId===principalId&&item.status==="ACTIVE"
    );
  }

  #nextGeneration(principalId){
    const keys=this.stateAt().filter(item=>item.principalId===principalId);
    return keys.length?Math.max(...keys.map(item=>item.generation))+1:1;
  }

  #append(body){
    const event={...body,fingerprint:fingerprint(body)};
    this.#events.push(event);
    replayEvents(this.#constitution,this.#events);
    return clone(event);
  }

  enrollKey({
    principalId,
    keyId,
    publicKeyPem,
    privateKeyPem,
    bootstrapReceipt
  }){
    const principal=cleanString(principalId,"principalId");
    principalExists(this.#constitution,principal);
    const id=cleanString(keyId,"keyId");
    if(this.stateAt().some(item=>item.keyId===id)) throw new Error("keyId already exists");
    const pem=assertEd25519PublicKey(publicKeyPem);
    const bootstrap=cleanString(bootstrapReceipt,"bootstrapReceipt");
    const sequence=this.sequence()+1;
    const generation=this.#nextGeneration(principal);
    const publicKeyFingerprint=principalPublicKeyFingerprint(pem);
    const payload={
      version:"PRINCIPAL_KEY_ENROLLMENT_V0.1",
      registryId:this.#registryId,
      constitutionFingerprint:this.#constitution.fingerprint,
      sequence,
      principalId:principal,
      keyId:id,
      generation,
      publicKeyFingerprint,
      bootstrapReceiptFingerprint:fingerprint({bootstrapReceipt:bootstrap})
    };
    const proofOfPossession=signPayload(payload,privateKeyPem);
    if(!verifyPayload(payload,proofOfPossession,pem)){
      throw new Error("Enrollment private key does not match public key");
    }
    return this.#append({
      type:"ENROLL",
      ...payload,
      publicKeyPem:pem,
      proofOfPossessionAlgorithm:"Ed25519",
      proofOfPossession,
      previousEventFingerprint:this.#events.at(-1)?.fingerprint??null
    });
  }

  rotateKey({
    principalId,
    oldKeyId,
    oldPrivateKeyPem,
    newKeyId,
    newPublicKeyPem,
    newPrivateKeyPem,
    reason
  }){
    const principal=cleanString(principalId,"principalId");
    principalExists(this.#constitution,principal);
    const oldId=cleanString(oldKeyId,"oldKeyId");
    const newId=cleanString(newKeyId,"newKeyId");
    const why=cleanString(reason,"reason");
    const oldKey=this.key(principal,oldId);
    if(!oldKey||oldKey.status!=="ACTIVE") throw new Error("Rotation old key must be active");
    if(this.stateAt().some(item=>item.keyId===newId)) throw new Error("newKeyId already exists");
    const newPem=assertEd25519PublicKey(newPublicKeyPem);
    const sequence=this.sequence()+1;
    const newGeneration=this.#nextGeneration(principal);
    const newPublicKeyFingerprint=principalPublicKeyFingerprint(newPem);
    const payload={
      version:"PRINCIPAL_KEY_ROTATION_V0.1",
      registryId:this.#registryId,
      constitutionFingerprint:this.#constitution.fingerprint,
      sequence,
      principalId:principal,
      oldKeyId:oldId,
      oldPublicKeyFingerprint:oldKey.publicKeyFingerprint,
      newKeyId:newId,
      newGeneration,
      newPublicKeyFingerprint,
      reason:why
    };
    const oldKeySignature=signPayload(payload,oldPrivateKeyPem);
    const newKeyProof=signPayload(payload,newPrivateKeyPem);
    if(!verifyPayload(payload,oldKeySignature,oldKey.publicKeyPem)){
      throw new Error("Rotation old private key does not match");
    }
    if(!verifyPayload(payload,newKeyProof,newPem)){
      throw new Error("Rotation new private key does not match");
    }
    return this.#append({
      type:"ROTATE",
      ...payload,
      newPublicKeyPem:newPem,
      oldKeySignature,
      newKeyProof,
      algorithm:"Ed25519",
      previousEventFingerprint:this.#events.at(-1)?.fingerprint??null
    });
  }

  revokeKey({
    principalId,
    targetKeyId,
    authorizerKeyId,
    authorizerPrivateKeyPem,
    reason
  }){
    const principal=cleanString(principalId,"principalId");
    principalExists(this.#constitution,principal);
    const targetId=cleanString(targetKeyId,"targetKeyId");
    const authId=cleanString(authorizerKeyId,"authorizerKeyId");
    const why=cleanString(reason,"reason");
    if(targetId===authId) throw new Error("Revocation requires a distinct authorizer key");
    const target=this.key(principal,targetId);
    const authorizer=this.key(principal,authId);
    if(!target||target.status!=="ACTIVE") throw new Error("Revocation target key must be active");
    if(!authorizer||authorizer.status!=="ACTIVE") throw new Error("Revocation authorizer key must be active");
    const sequence=this.sequence()+1;
    const payload={
      version:"PRINCIPAL_KEY_REVOCATION_V0.1",
      registryId:this.#registryId,
      constitutionFingerprint:this.#constitution.fingerprint,
      sequence,
      principalId:principal,
      targetKeyId:targetId,
      targetPublicKeyFingerprint:target.publicKeyFingerprint,
      authorizerKeyId:authId,
      authorizerPublicKeyFingerprint:authorizer.publicKeyFingerprint,
      reason:why
    };
    const authorizerSignature=signPayload(payload,authorizerPrivateKeyPem);
    if(!verifyPayload(payload,authorizerSignature,authorizer.publicKeyPem)){
      throw new Error("Revocation authorizer private key does not match");
    }
    return this.#append({
      type:"REVOKE",
      ...payload,
      authorizerSignature,
      algorithm:"Ed25519",
      previousEventFingerprint:this.#events.at(-1)?.fingerprint??null
    });
  }

  recoverPrincipal({
    principalId,
    newKeyId,
    newPublicKeyPem,
    newPrivateKeyPem,
    recoveryReceipt,
    reason
  }){
    const principal=cleanString(principalId,"principalId");
    principalExists(this.#constitution,principal);
    const newId=cleanString(newKeyId,"newKeyId");
    const receipt=cleanString(recoveryReceipt,"recoveryReceipt");
    const why=cleanString(reason,"reason");
    if(this.stateAt().some(item=>item.keyId===newId)) throw new Error("newKeyId already exists");
    const newPem=assertEd25519PublicKey(newPublicKeyPem);
    const sequence=this.sequence()+1;
    const newGeneration=this.#nextGeneration(principal);
    const newPublicKeyFingerprint=principalPublicKeyFingerprint(newPem);
    const payload={
      version:"PRINCIPAL_KEY_RECOVERY_V0.1",
      registryId:this.#registryId,
      constitutionFingerprint:this.#constitution.fingerprint,
      sequence,
      principalId:principal,
      newKeyId:newId,
      newGeneration,
      newPublicKeyFingerprint,
      recoveryReceiptFingerprint:fingerprint({recoveryReceipt:receipt}),
      reason:why
    };
    const newKeyProof=signPayload(payload,newPrivateKeyPem);
    if(!verifyPayload(payload,newKeyProof,newPem)){
      throw new Error("Recovery new private key does not match");
    }
    return this.#append({
      type:"RECOVER",
      ...payload,
      newPublicKeyPem:newPem,
      newKeyProof,
      algorithm:"Ed25519",
      recoveryAssurance:"EXTERNAL_RECOVERY_RECEIPT_ONLY",
      previousEventFingerprint:this.#events.at(-1)?.fingerprint??null
    });
  }

  export(){
    return this.snapshotAt();
  }

  static fromSnapshot(constitution,snapshot){
    if(!verifyPolicyConstitution(constitution)) throw new Error("Policy constitution fingerprint mismatch");
    if(snapshot?.version!==PRINCIPAL_KEY_REGISTRY_VERSION||!verifyFingerprint(snapshot)){
      throw new Error("Principal key registry fingerprint mismatch");
    }
    if(snapshot.constitutionFingerprint!==constitution.fingerprint){
      throw new Error("Principal key registry belongs to another constitution");
    }
    if(snapshot.sequence!==(snapshot.events??[]).length){
      throw new Error("Principal key registry sequence mismatch");
    }
    replayEvents(constitution,snapshot.events??[]);
    const registry=new PrincipalKeyRegistry(constitution,{registryId:snapshot.registryId});
    registry.#events=(snapshot.events??[]).map(clone);
    return registry;
  }
}

export function createSignedPrincipalApproval(
  keyRegistry,
  constitution,
  {
    principalId,
    keyId,
    actionType,
    subjectFingerprint,
    lineageKey,
    privateKeyPem
  }
){
  if(!verifyPolicyConstitution(constitution)) throw new Error("Policy constitution fingerprint mismatch");
  if(keyRegistry.constitution().fingerprint!==constitution.fingerprint){
    throw new Error("Principal key registry belongs to another constitution");
  }
  const principal=cleanString(principalId,"principalId");
  const key=keyRegistry.key(principal,cleanString(keyId,"keyId"));
  if(!key||key.status!=="ACTIVE") throw new Error("Signing key must be active");
  const subject=cleanString(subjectFingerprint,"subjectFingerprint");
  if(!/^[a-f0-9]{64}$/.test(subject)) throw new TypeError("subjectFingerprint must be lowercase SHA-256");
  const lineage=cleanString(lineageKey,"lineageKey");
  const registrySnapshot=keyRegistry.export();
  const payload={
    version:SIGNED_PRINCIPAL_APPROVAL_VERSION,
    registryId:registrySnapshot.registryId,
    registrySequence:registrySnapshot.sequence,
    registryFingerprint:registrySnapshot.fingerprint,
    constitutionFingerprint:constitution.fingerprint,
    principalId:principal,
    keyId:key.keyId,
    keyGeneration:key.generation,
    publicKeyFingerprint:key.publicKeyFingerprint,
    actionType:cleanString(actionType,"actionType"),
    subjectFingerprint:subject,
    lineageKey:lineage,
    identityAssurance:"PUBLIC_KEY_POSSESSION"
  };
  const signature=signPayload(payload,privateKeyPem);
  if(!verifyPayload(payload,signature,key.publicKeyPem)){
    throw new Error("Approval private key does not match registered public key");
  }
  const body={...payload,algorithm:"Ed25519",signature};
  return {...body,fingerprint:fingerprint(body)};
}

export function verifySignedPrincipalApproval(
  keyRegistry,
  constitution,
  approval,
  {
    requireCurrent=true,
    actionType=null,
    subjectFingerprint=null,
    lineageKey=null
  }={}
){
  try{
    if(!verifyPolicyConstitution(constitution)) return false;
    if(approval?.version!==SIGNED_PRINCIPAL_APPROVAL_VERSION||!verifyFingerprint(approval)) return false;
    if(approval.algorithm!=="Ed25519"||approval.identityAssurance!=="PUBLIC_KEY_POSSESSION") return false;
    if(approval.constitutionFingerprint!==constitution.fingerprint) return false;
    if(approval.registryId!==keyRegistry.registryId()) return false;
    if(actionType!==null&&approval.actionType!==actionType) return false;
    if(subjectFingerprint!==null&&approval.subjectFingerprint!==subjectFingerprint) return false;
    if(lineageKey!==null&&approval.lineageKey!==lineageKey) return false;

    const historicalSnapshot=keyRegistry.snapshotAt(approval.registrySequence);
    if(historicalSnapshot.fingerprint!==approval.registryFingerprint) return false;

    const key=keyRegistry.key(approval.principalId,approval.keyId,{sequence:approval.registrySequence});
    if(!key||key.status!=="ACTIVE") return false;
    if(key.generation!==approval.keyGeneration) return false;
    if(key.publicKeyFingerprint!==approval.publicKeyFingerprint) return false;

    if(requireCurrent){
      if(approval.registrySequence!==keyRegistry.sequence()) return false;
      const current=keyRegistry.key(approval.principalId,approval.keyId);
      if(!current||current.status!=="ACTIVE") return false;
    }

    const payload={
      version:approval.version,
      registryId:approval.registryId,
      registrySequence:approval.registrySequence,
      registryFingerprint:approval.registryFingerprint,
      constitutionFingerprint:approval.constitutionFingerprint,
      principalId:approval.principalId,
      keyId:approval.keyId,
      keyGeneration:approval.keyGeneration,
      publicKeyFingerprint:approval.publicKeyFingerprint,
      actionType:approval.actionType,
      subjectFingerprint:approval.subjectFingerprint,
      lineageKey:approval.lineageKey,
      identityAssurance:approval.identityAssurance
    };
    return verifyPayload(payload,approval.signature,key.publicKeyPem);
  }catch{
    return false;
  }
}

export function authorizeCryptographically(
  authorityLedger,
  keyRegistry,
  {
    actionType,
    subjectFingerprint,
    lineageKey,
    signedApprovals
  }
){
  const constitution=authorityLedger.constitution();
  if(!Array.isArray(signedApprovals)||!signedApprovals.length){
    throw new TypeError("signedApprovals must be a non-empty array");
  }
  for(const approval of signedApprovals){
    if(!verifySignedPrincipalApproval(keyRegistry,constitution,approval,{
      requireCurrent:true,
      actionType,
      subjectFingerprint,
      lineageKey
    })){
      throw new Error("Signed principal approval verification failed");
    }
  }

  const constitutionalReceipt=authorityLedger.authorize({
    actionType,
    subjectFingerprint,
    lineageKey,
    approvals:signedApprovals.map(approval=>({
      principalId:approval.principalId,
      approvalReceipt:"signed-principal-approval:"+approval.fingerprint
    }))
  });

  const snapshot=keyRegistry.export();
  const body={
    version:CRYPTOGRAPHIC_AUTHORIZATION_ATTESTATION_VERSION,
    constitutionFingerprint:constitution.fingerprint,
    keyRegistryId:snapshot.registryId,
    keyRegistrySequence:snapshot.sequence,
    keyRegistryFingerprint:snapshot.fingerprint,
    actionType,
    subjectFingerprint,
    lineageKey,
    constitutionalReceipt,
    signedApprovals:clone(signedApprovals),
    identityAssurance:"PUBLIC_KEY_POSSESSION",
    actionAuthorized:true,
    actionPerformed:false,
    boundaries:{
      legalIdentityEstablished:false,
      physicalHumanIdentityEstablished:false,
      trustedTimestampEstablished:false,
      cryptographicKeyPossessionEstablished:true,
      authorizationDoesNotExecuteAction:true
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyCryptographicAuthorizationAttestation(
  constitution,
  keyRegistry,
  attestation,
  {requireCurrentRegistry=false}={}
){
  try{
    if(
      attestation?.version!==CRYPTOGRAPHIC_AUTHORIZATION_ATTESTATION_VERSION||
      !verifyFingerprint(attestation)||
      attestation.identityAssurance!=="PUBLIC_KEY_POSSESSION"||
      attestation.actionAuthorized!==true||
      attestation.actionPerformed!==false||
      attestation.constitutionFingerprint!==constitution.fingerprint||
      attestation.keyRegistryId!==keyRegistry.registryId()
    ) return false;

    const snapshot=keyRegistry.snapshotAt(attestation.keyRegistrySequence);
    if(snapshot.fingerprint!==attestation.keyRegistryFingerprint) return false;
    if(requireCurrentRegistry&&attestation.keyRegistrySequence!==keyRegistry.sequence()) return false;

    if(!verifyConstitutionalAuthorizationReceipt(constitution,attestation.constitutionalReceipt)){
      return false;
    }
    if(
      attestation.constitutionalReceipt.actionType!==attestation.actionType||
      attestation.constitutionalReceipt.subjectFingerprint!==attestation.subjectFingerprint||
      attestation.constitutionalReceipt.lineageKey!==attestation.lineageKey
    ) return false;

    const approvalByPrincipal=new Map(attestation.signedApprovals.map(item=>[item.principalId,item]));
    if(approvalByPrincipal.size!==attestation.signedApprovals.length) return false;

    for(const approval of attestation.signedApprovals){
      if(!verifySignedPrincipalApproval(keyRegistry,constitution,approval,{
        requireCurrent:false,
        actionType:attestation.actionType,
        subjectFingerprint:attestation.subjectFingerprint,
        lineageKey:attestation.lineageKey
      })) return false;
    }
    for(const innerApproval of attestation.constitutionalReceipt.approvals){
      const signed=approvalByPrincipal.get(innerApproval.principalId);
      if(!signed) return false;
      const expected=fingerprint({
        principalId:innerApproval.principalId,
        approvalReceipt:"signed-principal-approval:"+signed.fingerprint
      });
      if(innerApproval.approvalReceiptFingerprint!==expected) return false;
    }
    return true;
  }catch{
    return false;
  }
}
