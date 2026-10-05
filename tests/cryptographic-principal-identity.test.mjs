import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {
  AUTHORITY_ACTIONS,
  DEFAULT_AUTHORITY_RULES,
  DEFAULT_PORTFOLIO_POLICY,
  PortfolioGovernanceRegistry,
  ConstitutionalAuthorityLedger,
  PrincipalKeyRegistry,
  createPolicyConstitution,
  createSignedPrincipalApproval,
  verifySignedPrincipalApproval,
  authorizeCryptographically,
  verifyCryptographicAuthorizationAttestation,
  createPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  createPolicyPromotionProposal,
  activatePolicyPromotionCryptographically,
  monitorActivePolicy,
  rollbackActivePolicyCryptographically,
  fingerprint
} from "../src/index.js";

function pair(){
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  return {
    publicKeyPem:publicKey.export({type:"spki",format:"pem"}).toString(),
    privateKeyPem:privateKey.export({type:"pkcs8",format:"pem"}).toString()
  };
}

function principals(){
  return [
    {principalId:"proposer",displayName:"Proposer",domains:["POLICY_PROPOSAL","TRIAL_GOVERNANCE"]},
    {principalId:"trial",displayName:"Trial Governor",domains:["TRIAL_GOVERNANCE"]},
    {principalId:"review-a",displayName:"Reviewer A",domains:["POLICY_REVIEW","POLICY_ACTIVATION"]},
    {principalId:"review-b",displayName:"Reviewer B",domains:["POLICY_REVIEW"]},
    {principalId:"activator",displayName:"Activator",domains:["POLICY_ACTIVATION"]},
    {principalId:"rollback",displayName:"Rollback Governor",domains:["POLICY_ROLLBACK"]},
    {principalId:"governor-a",displayName:"Governor A",domains:["PORTFOLIO_WEIGHTS","PORTFOLIO_BUDGET","CONSTITUTION_AMENDMENT"]},
    {principalId:"governor-b",displayName:"Governor B",domains:["PORTFOLIO_WEIGHTS","PORTFOLIO_BUDGET","CONSTITUTION_AMENDMENT"]},
    {principalId:"portfolio",displayName:"Portfolio Selector",domains:["PORTFOLIO_SELECTION"]},
    {principalId:"campaign",displayName:"Campaign Selector",domains:["CAMPAIGN_SELECTION","EXPERIMENT_EXECUTION"]},
    {principalId:"executor",displayName:"Experiment Executor",domains:["EXPERIMENT_EXECUTION"]}
  ];
}

function constitution(){
  return createPolicyConstitution({
    constitutionId:"sicologist-crypto",
    principals:principals(),
    rules:DEFAULT_AUTHORITY_RULES
  });
}

function enroll(registry,principalId,keyId,keyPair){
  return registry.enrollKey({
    principalId,
    keyId,
    publicKeyPem:keyPair.publicKeyPem,
    privateKeyPem:keyPair.privateKeyPem,
    bootstrapReceipt:"bootstrap:"+principalId+":"+keyId
  });
}

function signApproval(registry,constitutionValue,keyPair,{
  principalId,keyId,actionType,subjectFingerprint,lineageKey
}){
  return createSignedPrincipalApproval(registry,constitutionValue,{
    principalId,
    keyId,
    actionType,
    subjectFingerprint,
    lineageKey,
    privateKeyPem:keyPair.privateKeyPem
  });
}

test("key enrollment proves possession and registry round-trips deterministically",()=>{
  const c=constitution();
  const registry=new PrincipalKeyRegistry(c,{registryId:"keys-a"});
  const k=pair();
  const event=enroll(registry,"proposer","proposer-1",k);

  assert.equal(event.type,"ENROLL");
  assert.equal(event.generation,1);
  assert.equal(registry.key("proposer","proposer-1").status,"ACTIVE");

  const snapshot=registry.export();
  const restored=PrincipalKeyRegistry.fromSnapshot(c,snapshot);
  assert.deepEqual(restored.export(),snapshot);
  assert.deepEqual(restored.stateAt(),registry.stateAt());
});

test("enrollment rejects a private key that does not match the public key",()=>{
  const c=constitution();
  const registry=new PrincipalKeyRegistry(c);
  const a=pair();
  const b=pair();
  assert.throws(()=>registry.enrollKey({
    principalId:"proposer",
    keyId:"bad-key",
    publicKeyPem:a.publicKeyPem,
    privateKeyPem:b.privateKeyPem,
    bootstrapReceipt:"bootstrap:bad"
  }),/does not match/);
});

test("rotation cross-signs old and new key and retires the old key",()=>{
  const c=constitution();
  const registry=new PrincipalKeyRegistry(c);
  const oldKey=pair();
  const newKey=pair();
  enroll(registry,"proposer","p-1",oldKey);

  const before=signApproval(registry,c,oldKey,{
    principalId:"proposer",
    keyId:"p-1",
    actionType:"PROPOSE_POLICY_REVISION",
    subjectFingerprint:"1".repeat(64),
    lineageKey:"rotation-lineage"
  });

  const rotation=registry.rotateKey({
    principalId:"proposer",
    oldKeyId:"p-1",
    oldPrivateKeyPem:oldKey.privateKeyPem,
    newKeyId:"p-2",
    newPublicKeyPem:newKey.publicKeyPem,
    newPrivateKeyPem:newKey.privateKeyPem,
    reason:"scheduled rotation"
  });

  assert.equal(rotation.type,"ROTATE");
  assert.equal(rotation.newGeneration,2);
  assert.equal(registry.key("proposer","p-1").status,"RETIRED");
  assert.equal(registry.key("proposer","p-2").status,"ACTIVE");
  assert.equal(verifySignedPrincipalApproval(registry,c,before,{requireCurrent:false}),true);
  assert.equal(verifySignedPrincipalApproval(registry,c,before,{requireCurrent:true}),false);
  assert.throws(()=>signApproval(registry,c,oldKey,{
    principalId:"proposer",
    keyId:"p-1",
    actionType:"PROPOSE_POLICY_REVISION",
    subjectFingerprint:"2".repeat(64),
    lineageKey:"rotation-lineage"
  }),/Signing key must be active/);
});

test("ordinary revocation requires a distinct active sibling key",()=>{
  const c=constitution();
  const registry=new PrincipalKeyRegistry(c);
  const a=pair();
  const b=pair();
  enroll(registry,"executor","exec-a",a);
  enroll(registry,"executor","exec-b",b);

  assert.throws(()=>registry.revokeKey({
    principalId:"executor",
    targetKeyId:"exec-a",
    authorizerKeyId:"exec-a",
    authorizerPrivateKeyPem:a.privateKeyPem,
    reason:"self revoke"
  }),/distinct authorizer/);

  const event=registry.revokeKey({
    principalId:"executor",
    targetKeyId:"exec-a",
    authorizerKeyId:"exec-b",
    authorizerPrivateKeyPem:b.privateKeyPem,
    reason:"suspected compromise"
  });
  assert.equal(event.type,"REVOKE");
  assert.equal(registry.key("executor","exec-a").status,"REVOKED");
  assert.equal(registry.key("executor","exec-b").status,"ACTIVE");
});

test("lost-key recovery revokes all active keys and records weaker assurance",()=>{
  const c=constitution();
  const registry=new PrincipalKeyRegistry(c);
  const oldA=pair();
  const oldB=pair();
  const replacement=pair();
  enroll(registry,"proposer","recover-a",oldA);
  enroll(registry,"proposer","recover-b",oldB);

  const event=registry.recoverPrincipal({
    principalId:"proposer",
    newKeyId:"recover-c",
    newPublicKeyPem:replacement.publicKeyPem,
    newPrivateKeyPem:replacement.privateKeyPem,
    recoveryReceipt:"external-recovery-case-42",
    reason:"all prior keys unavailable"
  });

  assert.equal(event.recoveryAssurance,"EXTERNAL_RECOVERY_RECEIPT_ONLY");
  assert.equal(event.newGeneration,3);
  assert.equal(registry.key("proposer","recover-a").status,"REVOKED");
  assert.equal(registry.key("proposer","recover-b").status,"REVOKED");
  assert.equal(registry.key("proposer","recover-c").status,"ACTIVE");
});

test("signed approval is bound to exact action subject lineage and registry snapshot",()=>{
  const c=constitution();
  const registry=new PrincipalKeyRegistry(c);
  const k=pair();
  enroll(registry,"governor-a","gov-a",k);
  const approval=signApproval(registry,c,k,{
    principalId:"governor-a",
    keyId:"gov-a",
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    subjectFingerprint:"3".repeat(64),
    lineageKey:"budget-lineage"
  });

  assert.equal(verifySignedPrincipalApproval(registry,c,approval,{
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    subjectFingerprint:"3".repeat(64),
    lineageKey:"budget-lineage"
  }),true);
  assert.equal(verifySignedPrincipalApproval(registry,c,approval,{
    actionType:"CHANGE_PORTFOLIO_WEIGHTS"
  }),false);
  assert.equal(verifySignedPrincipalApproval(registry,c,approval,{
    subjectFingerprint:"4".repeat(64)
  }),false);
});

test("cryptographic authorization satisfies constitutional quorum and produces outer attestation",()=>{
  const c=constitution();
  const ledger=new ConstitutionalAuthorityLedger(c);
  const registry=new PrincipalKeyRegistry(c);
  const a=pair();
  const b=pair();
  enroll(registry,"governor-a","gov-a",a);
  enroll(registry,"governor-b","gov-b",b);

  const args={
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    subjectFingerprint:"5".repeat(64),
    lineageKey:"budget-crypto"
  };
  const approvals=[
    signApproval(registry,c,a,{...args,principalId:"governor-a",keyId:"gov-a"}),
    signApproval(registry,c,b,{...args,principalId:"governor-b",keyId:"gov-b"})
  ];

  const attestation=authorizeCryptographically(ledger,registry,{
    ...args,
    signedApprovals:approvals
  });

  assert.equal(attestation.identityAssurance,"PUBLIC_KEY_POSSESSION");
  assert.equal(attestation.boundaries.cryptographicKeyPossessionEstablished,true);
  assert.equal(attestation.boundaries.legalIdentityEstablished,false);
  assert.equal(attestation.actionPerformed,false);
  assert.equal(verifyCryptographicAuthorizationAttestation(c,registry,attestation,{
    requireCurrentRegistry:true
  }),true);
});

test("registry change makes pending approvals stale for current authorization but keeps audit verification",()=>{
  const c=constitution();
  const ledger=new ConstitutionalAuthorityLedger(c);
  const registry=new PrincipalKeyRegistry(c);
  const a=pair();
  const b=pair();
  const a2=pair();
  enroll(registry,"governor-a","gov-a",a);
  enroll(registry,"governor-b","gov-b",b);

  const args={
    actionType:"CHANGE_PORTFOLIO_WEIGHTS",
    subjectFingerprint:"6".repeat(64),
    lineageKey:"weights-crypto"
  };
  const approvals=[
    signApproval(registry,c,a,{...args,principalId:"governor-a",keyId:"gov-a"}),
    signApproval(registry,c,b,{...args,principalId:"governor-b",keyId:"gov-b"})
  ];
  const attestation=authorizeCryptographically(ledger,registry,{
    ...args,
    signedApprovals:approvals
  });

  registry.rotateKey({
    principalId:"governor-a",
    oldKeyId:"gov-a",
    oldPrivateKeyPem:a.privateKeyPem,
    newKeyId:"gov-a-2",
    newPublicKeyPem:a2.publicKeyPem,
    newPrivateKeyPem:a2.privateKeyPem,
    reason:"rotate after authorization"
  });

  assert.equal(verifyCryptographicAuthorizationAttestation(c,registry,attestation,{
    requireCurrentRegistry:false
  }),true);
  assert.equal(verifyCryptographicAuthorizationAttestation(c,registry,attestation,{
    requireCurrentRegistry:true
  }),false);

  const freshLedger=new ConstitutionalAuthorityLedger(c);
  assert.throws(()=>authorizeCryptographically(freshLedger,registry,{
    ...args,
    signedApprovals:approvals
  }),/Signed principal approval verification failed/);
});

test("tampered registry snapshot is rejected on restore",()=>{
  const c=constitution();
  const registry=new PrincipalKeyRegistry(c);
  const k=pair();
  enroll(registry,"proposer","tamper-key",k);
  const snapshot=registry.export();
  snapshot.events[0].generation=99;
  assert.throws(()=>PrincipalKeyRegistry.fromSnapshot(c,snapshot),/fingerprint mismatch/);
});

test("tampered signed approval or attestation fails verification",()=>{
  const c=constitution();
  const ledger=new ConstitutionalAuthorityLedger(c);
  const registry=new PrincipalKeyRegistry(c);
  const a=pair();
  const b=pair();
  enroll(registry,"governor-a","gov-a",a);
  enroll(registry,"governor-b","gov-b",b);
  const args={
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    subjectFingerprint:"7".repeat(64),
    lineageKey:"tamper-lineage"
  };
  const approvals=[
    signApproval(registry,c,a,{...args,principalId:"governor-a",keyId:"gov-a"}),
    signApproval(registry,c,b,{...args,principalId:"governor-b",keyId:"gov-b"})
  ];
  const badApproval=structuredClone(approvals[0]);
  badApproval.actionType="CHANGE_PORTFOLIO_WEIGHTS";
  assert.equal(verifySignedPrincipalApproval(registry,c,badApproval),false);

  const attestation=authorizeCryptographically(ledger,registry,{
    ...args,
    signedApprovals:approvals
  });
  attestation.subjectFingerprint="8".repeat(64);
  assert.equal(verifyCryptographicAuthorizationAttestation(c,registry,attestation),false);
});

function lifecycleBundle(){
  const governance=new PortfolioGovernanceRegistry();
  const review=governance.governanceReview();
  const baseline={
    ...DEFAULT_PORTFOLIO_POLICY,
    maxAllocatedCampaigns:1,
    maxEstimatedCost:10
  };
  const candidate={
    maxAllocatedCampaigns:1,
    maxEstimatedCost:10,
    allocationStrategy:"PRIORITY_THEN_COST_FIT",
    weights:{
      informationOpportunity:.20,
      evidenceWeakness:.20,
      replicationNeed:.15,
      operatorImportance:.35,
      costEfficiency:.10
    }
  };
  const revision=createPortfolioPolicyRevision({
    baselinePolicy:baseline,
    proposedPolicy:candidate,
    governanceReview:review,
    revisionReason:"rung 24 lifecycle",
    proposerId:"proposer"
  });
  const protocol=createProspectivePolicyTrialProtocol(revision,{
    assignmentMode:"ALTERNATING_AB",
    minRounds:2,
    operatorApproved:true,
    approvalReceipt:"legacy:trial"
  });
  const summaryBody={
    version:"PROSPECTIVE_POLICY_TRIAL_SUMMARY_V0.1",
    trialProtocolFingerprint:protocol.fingerprint,
    completedRoundCount:2,
    minRoundsRequired:2,
    minRoundsMet:true,
    baseline:{
      assignedRoundCount:1,completedOutcomeCount:1,decisiveOutcomeCount:1,
      decisiveRate:1,inconclusiveRate:0,contradictionRate:0,
      outcomeCounts:{SURVIVED_CHALLENGE:1,WEAKENED:0,CONTRADICTED:0,INCONCLUSIVE:0}
    },
    candidate:{
      assignedRoundCount:1,completedOutcomeCount:1,decisiveOutcomeCount:1,
      decisiveRate:1,inconclusiveRate:0,contradictionRate:0,
      outcomeCounts:{SURVIVED_CHALLENGE:1,WEAKENED:0,CONTRADICTED:0,INCONCLUSIVE:0}
    },
    deltas:{decisiveRate:0,inconclusiveRate:0,contradictionRate:0},
    primaryMetrics:["contradictionRate","decisiveRate","inconclusiveRate"],
    evaluationStatus:"HUMAN_POLICY_REVIEW_REQUIRED",
    candidatePromotionAuthorized:false,
    automaticPolicyActivation:false,
    causalStatus:"NOT_ESTABLISHED",
    boundaries:{
      assignmentRandomized:false,
      observedOutcomeDifferencesAreNotCausalProof:true,
      humanReviewRequiredForPolicyActivation:true
    }
  };
  const summary={...summaryBody,fingerprint:fingerprint(summaryBody)};
  const proposal=createPolicyPromotionProposal(revision,protocol,summary,{
    reviewerId:"review-a",
    promotionReason:"Prospective review complete.",
    riskAcceptance:"Cryptographic approval does not establish causal superiority."
  });
  return {governance,revision,protocol,summary,proposal};
}

test("Rung 22 activation and rollback can require cryptographic constitutional approvals",()=>{
  const c=constitution();
  const ledger=new ConstitutionalAuthorityLedger(c);
  const registry=new PrincipalKeyRegistry(c);
  const bundle=lifecycleBundle();

  const keys={};
  for(const principalId of ["proposer","trial","review-a","review-b","activator","rollback"]){
    keys[principalId]=pair();
    enroll(registry,principalId,principalId+"-key",keys[principalId]);
  }

  const lineage=bundle.revision.fingerprint;
  function approve(actionType,subjectFingerprint,principalIds){
    const signedApprovals=principalIds.map(principalId=>
      signApproval(registry,c,keys[principalId],{
        principalId,
        keyId:principalId+"-key",
        actionType,
        subjectFingerprint,
        lineageKey:lineage
      })
    );
    return authorizeCryptographically(ledger,registry,{
      actionType,
      subjectFingerprint,
      lineageKey:lineage,
      signedApprovals
    });
  }

  approve("PROPOSE_POLICY_REVISION",bundle.revision.fingerprint,["proposer"]);
  approve("APPROVE_POLICY_TRIAL",bundle.protocol.fingerprint,["trial"]);
  approve("REVIEW_POLICY_PROMOTION",bundle.proposal.fingerprint,["review-a","review-b"]);
  const activationAuth=approve("ACTIVATE_POLICY",bundle.proposal.fingerprint,["activator"]);

  const activated=activatePolicyPromotionCryptographically(
    c,
    registry,
    activationAuth,
    bundle.proposal,
    bundle.governance
  );
  assert.ok(activated.activationReceipt.approvalReceipt.startsWith("crypto-constitutional:"));

  const monitor=monitorActivePolicy(activated.state,bundle.governance);
  const rollbackAuth=approve("ROLLBACK_POLICY",monitor.fingerprint,["rollback"]);
  const rolled=rollbackActivePolicyCryptographically(
    c,
    registry,
    rollbackAuth,
    activated.state,
    monitor,
    bundle.governance,
    {rollbackReason:"Cryptographically approved rollback."}
  );
  assert.equal(rolled.state.activePolicyFingerprint,activated.state.rollbackPolicyFingerprint);
  assert.ok(rolled.rollbackReceipt.approvalReceipt.startsWith("crypto-constitutional:"));
});

test("historical activation attestation cannot perform action after key registry changes",()=>{
  const c=constitution();
  const ledger=new ConstitutionalAuthorityLedger(c);
  const registry=new PrincipalKeyRegistry(c);
  const bundle=lifecycleBundle();

  const keys={};
  for(const principalId of ["proposer","trial","review-a","review-b","activator"]){
    keys[principalId]=pair();
    enroll(registry,principalId,principalId+"-key",keys[principalId]);
  }
  const replacement=pair();
  const lineage=bundle.revision.fingerprint;
  function approve(actionType,subjectFingerprint,principalIds){
    return authorizeCryptographically(ledger,registry,{
      actionType,
      subjectFingerprint,
      lineageKey:lineage,
      signedApprovals:principalIds.map(principalId=>
        signApproval(registry,c,keys[principalId],{
          principalId,
          keyId:principalId+"-key",
          actionType,
          subjectFingerprint,
          lineageKey:lineage
        })
      )
    });
  }
  approve("PROPOSE_POLICY_REVISION",bundle.revision.fingerprint,["proposer"]);
  approve("APPROVE_POLICY_TRIAL",bundle.protocol.fingerprint,["trial"]);
  approve("REVIEW_POLICY_PROMOTION",bundle.proposal.fingerprint,["review-a","review-b"]);
  const activationAuth=approve("ACTIVATE_POLICY",bundle.proposal.fingerprint,["activator"]);

  registry.rotateKey({
    principalId:"activator",
    oldKeyId:"activator-key",
    oldPrivateKeyPem:keys.activator.privateKeyPem,
    newKeyId:"activator-key-2",
    newPublicKeyPem:replacement.publicKeyPem,
    newPrivateKeyPem:replacement.privateKeyPem,
    reason:"rotation before activation execution"
  });

  assert.equal(verifyCryptographicAuthorizationAttestation(c,registry,activationAuth,{
    requireCurrentRegistry:false
  }),true);

  assert.throws(()=>activatePolicyPromotionCryptographically(
    c,
    registry,
    activationAuth,
    bundle.proposal,
    bundle.governance
  ),/attestation verification failed/);
});

test("authority action catalog remains unchanged by identity layer",()=>{
  assert.equal(AUTHORITY_ACTIONS.length,11);
});
