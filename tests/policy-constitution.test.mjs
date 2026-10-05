import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTHORITY_ACTIONS,
  AUTHORITY_DOMAINS,
  DEFAULT_AUTHORITY_RULES,
  DEFAULT_PORTFOLIO_POLICY,
  ClaimEvidenceRegistry,
  ClaimChallengeRegistry,
  PortfolioGovernanceRegistry,
  ConstitutionalAuthorityLedger,
  createPolicyConstitution,
  verifyPolicyConstitution,
  verifyConstitutionalAuthorizationReceipt,
  createConstitutionAmendmentProposal,
  applyConstitutionAmendment,
  createPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  createPolicyPromotionProposal,
  activatePolicyPromotionConstitutionally,
  monitorActivePolicy,
  rollbackActivePolicyConstitutionally,
  fingerprint
} from "../src/index.js";

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

function constitutionFixture(overrides={}){
  return createPolicyConstitution({
    constitutionId:"sicologist-policy",
    principals:principals(),
    ...overrides
  });
}

function approval(principalId,label=principalId){
  return {principalId,approvalReceipt:"approval:"+label};
}

function policyBundle(){
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
    revisionReason:"constitutional lifecycle fixture",
    proposerId:"proposer"
  });
  const protocol=createProspectivePolicyTrialProtocol(revision,{
    assignmentMode:"ALTERNATING_AB",
    minRounds:2,
    operatorApproved:true,
    approvalReceipt:"legacy:trial-freeze"
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
    promotionReason:"Prospective review completed.",
    riskAcceptance:"Trial differences remain descriptive."
  });
  return {governance,review,baseline,candidate,revision,protocol,summary,proposal};
}

function authorizeLifecycle(constitution,ledger,bundle){
  const lineage=bundle.revision.fingerprint;
  const proposal=ledger.authorize({
    actionType:"PROPOSE_POLICY_REVISION",
    subjectFingerprint:bundle.revision.fingerprint,
    lineageKey:lineage,
    approvals:[approval("proposer")]
  });
  const trial=ledger.authorize({
    actionType:"APPROVE_POLICY_TRIAL",
    subjectFingerprint:bundle.protocol.fingerprint,
    lineageKey:lineage,
    approvals:[approval("trial")]
  });
  const review=ledger.authorize({
    actionType:"REVIEW_POLICY_PROMOTION",
    subjectFingerprint:bundle.proposal.fingerprint,
    lineageKey:lineage,
    approvals:[approval("review-a"),approval("review-b")]
  });
  const activation=ledger.authorize({
    actionType:"ACTIVATE_POLICY",
    subjectFingerprint:bundle.proposal.fingerprint,
    lineageKey:lineage,
    approvals:[approval("activator")]
  });
  return {lineage,proposal,trial,review,activation};
}

test("constitution is deterministic, fingerprinted, and covers the authority catalog",()=>{
  const a=constitutionFixture();
  const b=constitutionFixture();
  assert.equal(verifyPolicyConstitution(a),true);
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(AUTHORITY_DOMAINS.length,11);
  assert.equal(AUTHORITY_ACTIONS.length,11);
  assert.equal(DEFAULT_AUTHORITY_RULES.length,11);
  assert.equal(a.identityAssurance,"DECLARED_PRINCIPAL_ONLY");
  assert.equal(a.boundaries.capabilityIsNotAuthority,true);
});

test("constitution rejects an unfulfillable quorum",()=>{
  const rules=DEFAULT_AUTHORITY_RULES.map(rule=>
    rule.actionType==="POLICY_REVIEW"
      ?{...rule,quorum:99}
      :rule
  );
  assert.throws(()=>createPolicyConstitution({
    constitutionId:"bad",
    principals:principals(),
    rules
  }),/not fulfillable/);
});

test("wrong authority domain cannot authorize an action",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  assert.throws(()=>ledger.authorize({
    actionType:"PROPOSE_POLICY_REVISION",
    subjectFingerprint:"a".repeat(64),
    lineageKey:"lineage-a",
    approvals:[approval("executor")]
  }),/lacks required authority domains/);
});

test("quorum counts distinct qualified principals",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  assert.throws(()=>ledger.authorize({
    actionType:"CHANGE_PORTFOLIO_WEIGHTS",
    subjectFingerprint:"b".repeat(64),
    lineageKey:"weights-1",
    approvals:[approval("governor-a")]
  }),/quorum not met/);

  assert.throws(()=>ledger.authorize({
    actionType:"CHANGE_PORTFOLIO_WEIGHTS",
    subjectFingerprint:"b".repeat(64),
    lineageKey:"weights-1",
    approvals:[approval("governor-a","one"),approval("governor-a","two")]
  }),/must be unique/);

  const receipt=ledger.authorize({
    actionType:"CHANGE_PORTFOLIO_WEIGHTS",
    subjectFingerprint:"b".repeat(64),
    lineageKey:"weights-1",
    approvals:[approval("governor-a"),approval("governor-b")]
  });
  assert.equal(receipt.actionAuthorized,true);
  assert.equal(receipt.actionPerformed,false);
});

test("required prior authorization prevents skipping policy stages",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  assert.throws(()=>ledger.authorize({
    actionType:"APPROVE_POLICY_TRIAL",
    subjectFingerprint:"c".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("trial")]
  }),/Missing required prior authorization/);
});

test("separation of duty blocks a multi-domain principal from approving its own proposal",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  ledger.authorize({
    actionType:"PROPOSE_POLICY_REVISION",
    subjectFingerprint:"d".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("proposer")]
  });

  assert.throws(()=>ledger.authorize({
    actionType:"APPROVE_POLICY_TRIAL",
    subjectFingerprint:"e".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("proposer")]
  }),/Separation-of-duty violation/);
});

test("promotion review requires two qualified reviewers",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  ledger.authorize({
    actionType:"PROPOSE_POLICY_REVISION",
    subjectFingerprint:"1".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("proposer")]
  });
  ledger.authorize({
    actionType:"APPROVE_POLICY_TRIAL",
    subjectFingerprint:"2".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("trial")]
  });

  assert.throws(()=>ledger.authorize({
    actionType:"REVIEW_POLICY_PROMOTION",
    subjectFingerprint:"3".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("review-a")]
  }),/quorum not met/);

  const receipt=ledger.authorize({
    actionType:"REVIEW_POLICY_PROMOTION",
    subjectFingerprint:"3".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("review-a"),approval("review-b")]
  });
  assert.equal(receipt.approvals.length,2);
});

test("activation cannot reuse a promotion reviewer even if that person has activation capability",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  ledger.authorize({
    actionType:"PROPOSE_POLICY_REVISION",
    subjectFingerprint:"4".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("proposer")]
  });
  ledger.authorize({
    actionType:"APPROVE_POLICY_TRIAL",
    subjectFingerprint:"5".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("trial")]
  });
  ledger.authorize({
    actionType:"REVIEW_POLICY_PROMOTION",
    subjectFingerprint:"6".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("review-a"),approval("review-b")]
  });

  assert.throws(()=>ledger.authorize({
    actionType:"ACTIVATE_POLICY",
    subjectFingerprint:"7".repeat(64),
    lineageKey:"policy-lineage",
    approvals:[approval("review-a")]
  }),/Separation-of-duty violation/);
});

test("experiment execution authority is separated from campaign-step selection",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  ledger.authorize({
    actionType:"SELECT_PORTFOLIO_PROGRAM",
    subjectFingerprint:"8".repeat(64),
    lineageKey:"experiment-lineage",
    approvals:[approval("portfolio")]
  });
  ledger.authorize({
    actionType:"SELECT_CAMPAIGN_STEP",
    subjectFingerprint:"9".repeat(64),
    lineageKey:"experiment-lineage",
    approvals:[approval("campaign")]
  });

  assert.throws(()=>ledger.authorize({
    actionType:"AUTHORIZE_EXPERIMENT_EXECUTION",
    subjectFingerprint:"a".repeat(64),
    lineageKey:"experiment-lineage",
    approvals:[approval("campaign")]
  }),/Separation-of-duty violation/);

  const receipt=ledger.authorize({
    actionType:"AUTHORIZE_EXPERIMENT_EXECUTION",
    subjectFingerprint:"a".repeat(64),
    lineageKey:"experiment-lineage",
    approvals:[approval("executor")]
  });
  assert.equal(receipt.actionAuthorized,true);
  assert.equal(receipt.boundaries.authorizationDoesNotExecuteAction,true);
});

test("duplicate authorization for the same action subject and lineage is rejected",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  const args={
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    subjectFingerprint:"b".repeat(64),
    lineageKey:"budget-lineage",
    approvals:[approval("governor-a"),approval("governor-b")]
  };
  ledger.authorize(args);
  assert.throws(()=>ledger.authorize(args),/DUPLICATE_CONSTITUTIONAL_AUTHORIZATION/);
});

test("suspended principals cannot satisfy authority rules",()=>{
  const ps=principals().map(item=>
    item.principalId==="executor"?{...item,status:"SUSPENDED"}:item
  );
  const constitution=createPolicyConstitution({
    constitutionId:"suspended-test",
    principals:ps,
    rules:DEFAULT_AUTHORITY_RULES.map(rule=>
      rule.actionType==="AUTHORIZE_EXPERIMENT_EXECUTION"
        ?{...rule,quorum:1}
        :rule
    )
  });
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  ledger.authorize({
    actionType:"SELECT_PORTFOLIO_PROGRAM",
    subjectFingerprint:"c".repeat(64),
    lineageKey:"exec",
    approvals:[approval("portfolio")]
  });
  ledger.authorize({
    actionType:"SELECT_CAMPAIGN_STEP",
    subjectFingerprint:"d".repeat(64),
    lineageKey:"exec",
    approvals:[approval("campaign")]
  });
  assert.throws(()=>ledger.authorize({
    actionType:"AUTHORIZE_EXPERIMENT_EXECUTION",
    subjectFingerprint:"e".repeat(64),
    lineageKey:"exec",
    approvals:[approval("executor")]
  }),/lacks required authority domains/);
});

test("ledger export restore preserves constitutional receipts",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  ledger.authorize({
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    subjectFingerprint:"f".repeat(64),
    lineageKey:"budget",
    approvals:[approval("governor-a"),approval("governor-b")]
  });
  const snapshot=ledger.export();
  const restored=ConstitutionalAuthorityLedger.fromSnapshot(snapshot);
  assert.deepEqual(restored.export(),snapshot);
});

test("tampered authorization receipt fails verification",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  const receipt=ledger.authorize({
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    subjectFingerprint:"0".repeat(64),
    lineageKey:"budget",
    approvals:[approval("governor-a"),approval("governor-b")]
  });
  assert.equal(verifyConstitutionalAuthorizationReceipt(constitution,receipt),true);
  receipt.rule.quorum=1;
  assert.equal(verifyConstitutionalAuthorizationReceipt(constitution,receipt),false);
});

test("constitution amendment must be authorized under the prior constitution",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  const nextPrincipals=[
    ...principals(),
    {principalId:"new-observer",displayName:"New Observer",domains:["PORTFOLIO_SELECTION"]}
  ];
  const amendment=createConstitutionAmendmentProposal(constitution,{
    principals:nextPrincipals,
    amendmentReason:"Add a new declared portfolio observer principal."
  });

  assert.throws(()=>applyConstitutionAmendment(
    constitution,
    amendment,
    {fingerprint:"x"}
  ),/authorization receipt fingerprint mismatch/);

  const authorization=ledger.authorize({
    actionType:"AMEND_CONSTITUTION",
    subjectFingerprint:amendment.fingerprint,
    lineageKey:constitution.constitutionId,
    approvals:[approval("governor-a"),approval("governor-b")]
  });
  const revised=applyConstitutionAmendment(
    constitution,
    amendment,
    authorization
  );
  assert.equal(revised.revision,2);
  assert.equal(revised.previousConstitutionFingerprint,constitution.fingerprint);
  assert.equal(revised.principals.some(x=>x.principalId==="new-observer"),true);
  assert.notEqual(revised.fingerprint,constitution.fingerprint);
});

test("constitutional activation and rollback satisfy Rung 22 operator gates",()=>{
  const constitution=constitutionFixture();
  const ledger=new ConstitutionalAuthorityLedger(constitution);
  const bundle=policyBundle();
  const auth=authorizeLifecycle(constitution,ledger,bundle);

  const activated=activatePolicyPromotionConstitutionally(
    constitution,
    auth.activation,
    bundle.proposal,
    bundle.governance
  );
  assert.equal(activated.state.activePolicyFingerprint,bundle.proposal.candidatePolicyFingerprint);
  assert.ok(activated.activationReceipt.approvalReceipt.startsWith("constitutional:"));

  const monitor=monitorActivePolicy(activated.state,bundle.governance);
  const rollbackAuth=ledger.authorize({
    actionType:"ROLLBACK_POLICY",
    subjectFingerprint:monitor.fingerprint,
    lineageKey:auth.lineage,
    approvals:[approval("rollback")]
  });
  const rolled=rollbackActivePolicyConstitutionally(
    constitution,
    rollbackAuth,
    activated.state,
    monitor,
    bundle.governance,
    {rollbackReason:"Constitutionally approved discretionary rollback."}
  );
  assert.equal(rolled.state.activePolicyFingerprint,activated.state.rollbackPolicyFingerprint);
  assert.ok(rolled.rollbackReceipt.approvalReceipt.startsWith("constitutional:"));
});
