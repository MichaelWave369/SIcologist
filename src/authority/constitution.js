import {fingerprint} from "../experiment/fingerprint.js";

export const POLICY_CONSTITUTION_VERSION="POLICY_CONSTITUTION_V0.1";
export const CONSTITUTIONAL_AUTHORIZATION_VERSION="CONSTITUTIONAL_AUTHORIZATION_RECEIPT_V0.1";

export const AUTHORITY_DOMAINS=Object.freeze([
  "POLICY_PROPOSAL",
  "TRIAL_GOVERNANCE",
  "POLICY_REVIEW",
  "POLICY_ACTIVATION",
  "POLICY_ROLLBACK",
  "PORTFOLIO_WEIGHTS",
  "PORTFOLIO_BUDGET",
  "PORTFOLIO_SELECTION",
  "CAMPAIGN_SELECTION",
  "EXPERIMENT_EXECUTION",
  "CONSTITUTION_AMENDMENT"
]);

export const AUTHORITY_ACTIONS=Object.freeze([
  "PROPOSE_POLICY_REVISION",
  "APPROVE_POLICY_TRIAL",
  "REVIEW_POLICY_PROMOTION",
  "ACTIVATE_POLICY",
  "ROLLBACK_POLICY",
  "CHANGE_PORTFOLIO_WEIGHTS",
  "CHANGE_PORTFOLIO_BUDGET",
  "SELECT_PORTFOLIO_PROGRAM",
  "SELECT_CAMPAIGN_STEP",
  "AUTHORIZE_EXPERIMENT_EXECUTION",
  "AMEND_CONSTITUTION"
]);

export const DEFAULT_AUTHORITY_RULES=Object.freeze([
  Object.freeze({
    actionType:"PROPOSE_POLICY_REVISION",
    requiredDomains:Object.freeze(["POLICY_PROPOSAL"]),
    quorum:1,
    requiresPriorActions:Object.freeze([]),
    separateFromActions:Object.freeze([])
  }),
  Object.freeze({
    actionType:"APPROVE_POLICY_TRIAL",
    requiredDomains:Object.freeze(["TRIAL_GOVERNANCE"]),
    quorum:1,
    requiresPriorActions:Object.freeze(["PROPOSE_POLICY_REVISION"]),
    separateFromActions:Object.freeze(["PROPOSE_POLICY_REVISION"])
  }),
  Object.freeze({
    actionType:"REVIEW_POLICY_PROMOTION",
    requiredDomains:Object.freeze(["POLICY_REVIEW"]),
    quorum:2,
    requiresPriorActions:Object.freeze(["APPROVE_POLICY_TRIAL"]),
    separateFromActions:Object.freeze(["PROPOSE_POLICY_REVISION"])
  }),
  Object.freeze({
    actionType:"ACTIVATE_POLICY",
    requiredDomains:Object.freeze(["POLICY_ACTIVATION"]),
    quorum:1,
    requiresPriorActions:Object.freeze(["REVIEW_POLICY_PROMOTION"]),
    separateFromActions:Object.freeze([
      "PROPOSE_POLICY_REVISION",
      "REVIEW_POLICY_PROMOTION"
    ])
  }),
  Object.freeze({
    actionType:"ROLLBACK_POLICY",
    requiredDomains:Object.freeze(["POLICY_ROLLBACK"]),
    quorum:1,
    requiresPriorActions:Object.freeze(["ACTIVATE_POLICY"]),
    separateFromActions:Object.freeze(["ACTIVATE_POLICY"])
  }),
  Object.freeze({
    actionType:"CHANGE_PORTFOLIO_WEIGHTS",
    requiredDomains:Object.freeze(["PORTFOLIO_WEIGHTS"]),
    quorum:2,
    requiresPriorActions:Object.freeze([]),
    separateFromActions:Object.freeze([])
  }),
  Object.freeze({
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    requiredDomains:Object.freeze(["PORTFOLIO_BUDGET"]),
    quorum:2,
    requiresPriorActions:Object.freeze([]),
    separateFromActions:Object.freeze([])
  }),
  Object.freeze({
    actionType:"SELECT_PORTFOLIO_PROGRAM",
    requiredDomains:Object.freeze(["PORTFOLIO_SELECTION"]),
    quorum:1,
    requiresPriorActions:Object.freeze([]),
    separateFromActions:Object.freeze([])
  }),
  Object.freeze({
    actionType:"SELECT_CAMPAIGN_STEP",
    requiredDomains:Object.freeze(["CAMPAIGN_SELECTION"]),
    quorum:1,
    requiresPriorActions:Object.freeze(["SELECT_PORTFOLIO_PROGRAM"]),
    separateFromActions:Object.freeze([])
  }),
  Object.freeze({
    actionType:"AUTHORIZE_EXPERIMENT_EXECUTION",
    requiredDomains:Object.freeze(["EXPERIMENT_EXECUTION"]),
    quorum:1,
    requiresPriorActions:Object.freeze(["SELECT_CAMPAIGN_STEP"]),
    separateFromActions:Object.freeze(["SELECT_CAMPAIGN_STEP"])
  }),
  Object.freeze({
    actionType:"AMEND_CONSTITUTION",
    requiredDomains:Object.freeze(["CONSTITUTION_AMENDMENT"]),
    quorum:2,
    requiresPriorActions:Object.freeze([]),
    separateFromActions:Object.freeze([])
  })
]);

function clone(value){ return structuredClone(value); }

function cleanString(value,name){
  if(typeof value!=="string"||!value.trim()) throw new TypeError(name+" is required");
  return value.trim();
}

function cleanPrincipal(principal){
  const principalId=cleanString(principal?.principalId,"principalId");
  const displayName=cleanString(principal?.displayName??principalId,"displayName");
  const status=principal?.status??"ACTIVE";
  if(!["ACTIVE","SUSPENDED"].includes(status)) throw new TypeError("Unsupported principal status");
  if(!Array.isArray(principal?.domains)||!principal.domains.length){
    throw new TypeError("Principal domains must be a non-empty array");
  }
  const domains=[...new Set(principal.domains.map(domain=>{
    if(!AUTHORITY_DOMAINS.includes(domain)) throw new TypeError("Unknown authority domain: "+domain);
    return domain;
  }))].sort();
  return {principalId,displayName,status,domains};
}

function cleanRule(rule){
  const actionType=cleanString(rule?.actionType,"actionType");
  if(!AUTHORITY_ACTIONS.includes(actionType)) throw new TypeError("Unknown authority action: "+actionType);
  if(!Array.isArray(rule?.requiredDomains)||!rule.requiredDomains.length){
    throw new TypeError("requiredDomains must be a non-empty array");
  }
  const requiredDomains=[...new Set(rule.requiredDomains.map(domain=>{
    if(!AUTHORITY_DOMAINS.includes(domain)) throw new TypeError("Unknown authority domain: "+domain);
    return domain;
  }))].sort();
  if(!Number.isInteger(rule?.quorum)||rule.quorum<1){
    throw new TypeError("quorum must be an integer >= 1");
  }
  const normalizeActions=(values,name)=>{
    if(!Array.isArray(values)) throw new TypeError(name+" must be an array");
    return [...new Set(values.map(action=>{
      if(!AUTHORITY_ACTIONS.includes(action)) throw new TypeError("Unknown authority action: "+action);
      if(action===actionType) throw new Error(name+" cannot contain its own action");
      return action;
    }))].sort();
  };
  return {
    actionType,
    requiredDomains,
    quorum:rule.quorum,
    requiresPriorActions:normalizeActions(rule.requiresPriorActions??[],"requiresPriorActions"),
    separateFromActions:normalizeActions(rule.separateFromActions??[],"separateFromActions")
  };
}

function principalCanSatisfy(principal,rule){
  return principal.status==="ACTIVE"&&
    rule.requiredDomains.every(domain=>principal.domains.includes(domain));
}

function verifyFingerprint(value){
  if(!value||typeof value!=="object"||typeof value.fingerprint!=="string") return false;
  const {fingerprint:stored,...body}=value;
  return fingerprint(body)===stored;
}

export function createPolicyConstitution({
  constitutionId,
  principals,
  rules=DEFAULT_AUTHORITY_RULES,
  revision=1,
  previousConstitutionFingerprint=null,
  amendmentReason=""
}){
  const id=cleanString(constitutionId,"constitutionId");
  if(!Array.isArray(principals)||!principals.length){
    throw new TypeError("principals must be a non-empty array");
  }
  if(!Number.isInteger(revision)||revision<1){
    throw new TypeError("revision must be an integer >= 1");
  }
  if(revision===1&&previousConstitutionFingerprint!==null){
    throw new Error("Initial constitution cannot have a previous fingerprint");
  }
  if(revision>1&&!/^[a-f0-9]{64}$/.test(previousConstitutionFingerprint??"")){
    throw new TypeError("Revised constitution requires previousConstitutionFingerprint");
  }

  const cleanPrincipals=principals.map(cleanPrincipal).sort((a,b)=>a.principalId.localeCompare(b.principalId));
  if(new Set(cleanPrincipals.map(item=>item.principalId)).size!==cleanPrincipals.length){
    throw new Error("Principal IDs must be unique");
  }

  const cleanRules=rules.map(cleanRule).sort((a,b)=>a.actionType.localeCompare(b.actionType));
  if(new Set(cleanRules.map(item=>item.actionType)).size!==cleanRules.length){
    throw new Error("Authority action rules must be unique");
  }
  const actionSet=new Set(cleanRules.map(item=>item.actionType));
  for(const rule of cleanRules){
    for(const prior of [...rule.requiresPriorActions,...rule.separateFromActions]){
      if(!actionSet.has(prior)){
        throw new Error("Authority rule references undefined action: "+prior);
      }
    }
    const eligible=cleanPrincipals.filter(principal=>principalCanSatisfy(principal,rule));
    if(eligible.length<rule.quorum){
      throw new Error("Authority rule is not fulfillable: "+rule.actionType);
    }
  }

  const body={
    version:POLICY_CONSTITUTION_VERSION,
    constitutionId:id,
    revision,
    previousConstitutionFingerprint,
    amendmentReason:typeof amendmentReason==="string"?amendmentReason.trim():"",
    principals:cleanPrincipals,
    rules:cleanRules,
    identityAssurance:"DECLARED_PRINCIPAL_ONLY",
    boundaries:{
      legalIdentityEstablished:false,
      cryptographicIdentityEstablished:false,
      rolePossessionIsNotActionAuthority:true,
      capabilityIsNotAuthority:true,
      constitutionMutatesNothingByItself:true
    }
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyPolicyConstitution(value){
  if(value?.version!==POLICY_CONSTITUTION_VERSION||!verifyFingerprint(value)) return false;
  try{
    const rebuilt=createPolicyConstitution({
      constitutionId:value.constitutionId,
      principals:value.principals,
      rules:value.rules,
      revision:value.revision,
      previousConstitutionFingerprint:value.previousConstitutionFingerprint,
      amendmentReason:value.amendmentReason
    });
    return rebuilt.fingerprint===value.fingerprint;
  }catch{
    return false;
  }
}

export function authorityRule(constitution,actionType){
  if(!verifyPolicyConstitution(constitution)) throw new Error("Policy constitution fingerprint mismatch");
  const rule=constitution.rules.find(item=>item.actionType===actionType);
  if(!rule) throw new Error("No constitutional rule for action: "+actionType);
  return clone(rule);
}

export function createConstitutionAmendmentProposal(constitution,{
  principals,
  rules=constitution?.rules,
  amendmentReason
}){
  if(!verifyPolicyConstitution(constitution)) throw new Error("Policy constitution fingerprint mismatch");
  const reason=cleanString(amendmentReason,"amendmentReason");
  const candidate=createPolicyConstitution({
    constitutionId:constitution.constitutionId,
    principals,
    rules,
    revision:constitution.revision+1,
    previousConstitutionFingerprint:constitution.fingerprint,
    amendmentReason:reason
  });
  const body={
    version:"CONSTITUTION_AMENDMENT_PROPOSAL_V0.1",
    constitutionId:constitution.constitutionId,
    currentConstitutionFingerprint:constitution.fingerprint,
    proposedConstitution:candidate,
    amendmentReason:reason,
    status:"PROPOSED_NOT_APPLIED"
  };
  return {...body,fingerprint:fingerprint(body)};
}

export function verifyConstitutionAmendmentProposal(value){
  return Boolean(
    value?.version==="CONSTITUTION_AMENDMENT_PROPOSAL_V0.1"&&
    verifyFingerprint(value)&&
    verifyPolicyConstitution(value.proposedConstitution)&&
    value.proposedConstitution.previousConstitutionFingerprint===value.currentConstitutionFingerprint
  );
}
