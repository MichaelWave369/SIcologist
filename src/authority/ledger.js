import {fingerprint} from "../experiment/fingerprint.js";
import {
  CONSTITUTIONAL_AUTHORIZATION_VERSION,
  authorityRule,
  verifyConstitutionAmendmentProposal,
  verifyPolicyConstitution
} from "./constitution.js";
import {
  activatePolicyPromotion,
  rollbackActivePolicy
} from "../portfolio/policy-lifecycle.js";

function clone(value){ return structuredClone(value); }

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

function cleanSubjectFingerprint(value){
  if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value)){
    throw new TypeError("subjectFingerprint must be a lowercase SHA-256 fingerprint");
  }
  return value;
}

function cleanLineageKey(value){
  if(typeof value!=="string"||!value.trim()) throw new TypeError("lineageKey is required");
  return value.trim();
}

function principalMap(constitution){
  return new Map(constitution.principals.map(item=>[item.principalId,item]));
}

function ruleSatisfiedBy(principal,rule){
  return principal.status==="ACTIVE"&&
    rule.requiredDomains.every(domain=>principal.domains.includes(domain));
}

export function verifyConstitutionalAuthorizationReceipt(constitution,receipt){
  if(
    !verifyPolicyConstitution(constitution)||
    receipt?.version!==CONSTITUTIONAL_AUTHORIZATION_VERSION||
    !verifyFingerprint(receipt)||
    receipt.constitutionFingerprint!==constitution.fingerprint||
    receipt.constitutionId!==constitution.constitutionId||
    receipt.constitutionRevision!==constitution.revision||
    receipt.actionAuthorized!==true||
    receipt.actionPerformed!==false||
    receipt.identityAssurance!=="DECLARED_PRINCIPAL_ONLY"
  ) return false;

  try{
    const rule=authorityRule(constitution,receipt.actionType);
    if(JSON.stringify(rule)!==JSON.stringify(receipt.rule)) return false;
    if(!Array.isArray(receipt.approvals)||receipt.approvals.length<rule.quorum) return false;
    const principals=principalMap(constitution);
    const seen=new Set();
    for(const approval of receipt.approvals){
      if(seen.has(approval.principalId)) return false;
      seen.add(approval.principalId);
      const principal=principals.get(approval.principalId);
      if(!principal||!ruleSatisfiedBy(principal,rule)) return false;
      if(approval.displayName!==principal.displayName) return false;
      if(JSON.stringify(approval.domains)!==JSON.stringify(principal.domains)) return false;
      if(typeof approval.approvalReceiptFingerprint!=="string"||
         !/^[a-f0-9]{64}$/.test(approval.approvalReceiptFingerprint)) return false;
    }
    return true;
  }catch{
    return false;
  }
}

export function assertConstitutionalAuthorization(
  constitution,
  receipt,
  {actionType,subjectFingerprint,lineageKey=null}
){
  if(!verifyConstitutionalAuthorizationReceipt(constitution,receipt)){
    throw new Error("Constitutional authorization receipt fingerprint mismatch");
  }
  if(receipt.actionType!==actionType){
    throw new Error("Constitutional authorization action mismatch");
  }
  if(receipt.subjectFingerprint!==subjectFingerprint){
    throw new Error("Constitutional authorization subject mismatch");
  }
  if(lineageKey!==null&&receipt.lineageKey!==lineageKey){
    throw new Error("Constitutional authorization lineage mismatch");
  }
  return true;
}

export class ConstitutionalAuthorityLedger{
  #constitution;
  #receipts=new Map();

  constructor(constitution){
    if(!verifyPolicyConstitution(constitution)){
      throw new Error("Policy constitution fingerprint mismatch");
    }
    this.#constitution=clone(constitution);
  }

  constitution(){ return clone(this.#constitution); }

  receipts(){
    return [...this.#receipts.values()]
      .map(clone)
      .sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
  }

  #lineageReceipts(lineageKey){
    return [...this.#receipts.values()]
      .filter(item=>item.lineageKey===lineageKey);
  }

  authorize({
    actionType,
    subjectFingerprint,
    lineageKey,
    approvals
  }){
    const subject=cleanSubjectFingerprint(subjectFingerprint);
    const lineage=cleanLineageKey(lineageKey);
    const rule=authorityRule(this.#constitution,actionType);
    if(!Array.isArray(approvals)||!approvals.length){
      throw new TypeError("approvals must be a non-empty array");
    }

    const principals=principalMap(this.#constitution);
    const seen=new Set();
    const normalized=approvals.map((approval,index)=>{
      const principalId=typeof approval?.principalId==="string"?approval.principalId.trim():"";
      if(!principalId) throw new TypeError("approvals["+index+"].principalId is required");
      if(seen.has(principalId)) throw new Error("Approval principals must be unique");
      seen.add(principalId);

      const principal=principals.get(principalId);
      if(!principal) throw new Error("Unknown principal: "+principalId);
      if(!ruleSatisfiedBy(principal,rule)){
        throw new Error("Principal lacks required authority domains: "+principalId);
      }
      if(typeof approval?.approvalReceipt!=="string"||!approval.approvalReceipt.trim()){
        throw new TypeError("approvals["+index+"].approvalReceipt is required");
      }
      return {
        principalId,
        displayName:principal.displayName,
        domains:[...principal.domains],
        approvalReceiptFingerprint:fingerprint({
          principalId,
          approvalReceipt:approval.approvalReceipt.trim()
        })
      };
    }).sort((a,b)=>a.principalId.localeCompare(b.principalId));

    if(normalized.length<rule.quorum){
      throw new Error("Constitutional quorum not met for "+actionType);
    }

    const lineageReceipts=this.#lineageReceipts(lineage);
    const priorEvidence=[];
    for(const requiredAction of rule.requiresPriorActions){
      const matches=lineageReceipts.filter(item=>item.actionType===requiredAction);
      if(!matches.length){
        throw new Error("Missing required prior authorization: "+requiredAction);
      }
      priorEvidence.push(...matches.map(item=>item.fingerprint));
    }

    const newPrincipalIds=new Set(normalized.map(item=>item.principalId));
    const separationEvidence=[];
    for(const separatedAction of rule.separateFromActions){
      const matches=lineageReceipts.filter(item=>item.actionType===separatedAction);
      const priorPrincipalIds=[...new Set(
        matches.flatMap(item=>item.approvals.map(approval=>approval.principalId))
      )].sort();
      const overlap=priorPrincipalIds.filter(id=>newPrincipalIds.has(id));
      if(overlap.length){
        throw new Error(
          "Separation-of-duty violation for "+actionType+
          " against "+separatedAction+": "+overlap.join(",")
        );
      }
      separationEvidence.push({
        actionType:separatedAction,
        priorPrincipalIds,
        overlap:[]
      });
    }

    const duplicate=[...this.#receipts.values()].find(item=>
      item.actionType===actionType&&
      item.subjectFingerprint===subject&&
      item.lineageKey===lineage
    );
    if(duplicate) throw new Error("DUPLICATE_CONSTITUTIONAL_AUTHORIZATION");

    const body={
      version:CONSTITUTIONAL_AUTHORIZATION_VERSION,
      constitutionId:this.#constitution.constitutionId,
      constitutionRevision:this.#constitution.revision,
      constitutionFingerprint:this.#constitution.fingerprint,
      actionType,
      subjectFingerprint:subject,
      lineageKey:lineage,
      rule:clone(rule),
      approvals:normalized,
      priorAuthorizationFingerprints:[...new Set(priorEvidence)].sort(),
      separationEvidence,
      actionAuthorized:true,
      actionPerformed:false,
      identityAssurance:"DECLARED_PRINCIPAL_ONLY",
      boundaries:{
        cryptographicPrincipalIdentityEstablished:false,
        legalPrincipalIdentityEstablished:false,
        authorizationDoesNotExecuteAction:true,
        capabilityIsNotAuthority:true
      }
    };
    const receipt={...body,fingerprint:fingerprint(body)};
    this.#receipts.set(receipt.fingerprint,receipt);
    return clone(receipt);
  }

  export(){
    const body={
      version:"CONSTITUTIONAL_AUTHORITY_LEDGER_V0.1",
      constitution:clone(this.#constitution),
      receipts:this.receipts()
    };
    return {...body,fingerprint:fingerprint(body)};
  }

  static fromSnapshot(snapshot){
    if(snapshot?.version!=="CONSTITUTIONAL_AUTHORITY_LEDGER_V0.1"){
      throw new TypeError("Unsupported constitutional authority ledger version");
    }
    const {fingerprint:stored,...body}=snapshot;
    if(fingerprint(body)!==stored){
      throw new Error("Constitutional authority ledger fingerprint mismatch");
    }
    const ledger=new ConstitutionalAuthorityLedger(snapshot.constitution);
    for(const receipt of snapshot.receipts??[]){
      if(!verifyConstitutionalAuthorizationReceipt(snapshot.constitution,receipt)){
        throw new Error("Constitutional authorization receipt fingerprint mismatch");
      }
      ledger.#receipts.set(receipt.fingerprint,clone(receipt));
    }
    return ledger;
  }
}

export function applyConstitutionAmendment(
  constitution,
  amendmentProposal,
  authorizationReceipt
){
  if(!verifyPolicyConstitution(constitution)){
    throw new Error("Policy constitution fingerprint mismatch");
  }
  if(!verifyConstitutionAmendmentProposal(amendmentProposal)){
    throw new Error("Constitution amendment proposal fingerprint mismatch");
  }
  if(amendmentProposal.currentConstitutionFingerprint!==constitution.fingerprint){
    throw new Error("Constitution amendment proposal targets another constitution revision");
  }
  assertConstitutionalAuthorization(constitution,authorizationReceipt,{
    actionType:"AMEND_CONSTITUTION",
    subjectFingerprint:amendmentProposal.fingerprint,
    lineageKey:constitution.constitutionId
  });
  return clone(amendmentProposal.proposedConstitution);
}

export function activatePolicyPromotionConstitutionally(
  constitution,
  authorizationReceipt,
  proposal,
  governanceRegistry
){
  assertConstitutionalAuthorization(constitution,authorizationReceipt,{
    actionType:"ACTIVATE_POLICY",
    subjectFingerprint:proposal.fingerprint
  });
  return activatePolicyPromotion(proposal,governanceRegistry,{
    operatorApproved:true,
    approvalReceipt:"constitutional:"+authorizationReceipt.fingerprint
  });
}

export function rollbackActivePolicyConstitutionally(
  constitution,
  authorizationReceipt,
  state,
  monitorReport,
  governanceRegistry,
  {rollbackReason}
){
  assertConstitutionalAuthorization(constitution,authorizationReceipt,{
    actionType:"ROLLBACK_POLICY",
    subjectFingerprint:monitorReport.fingerprint
  });
  return rollbackActivePolicy(state,monitorReport,governanceRegistry,{
    operatorApproved:true,
    approvalReceipt:"constitutional:"+authorizationReceipt.fingerprint,
    rollbackReason
  });
}
