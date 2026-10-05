import {
  ConstitutionalAuthorityLedger,
  createPolicyConstitution
} from "../src/index.js";

const constitution=createPolicyConstitution({
  constitutionId:"example-policy-constitution",
  principals:[
    {
      principalId:"proposer",
      displayName:"Policy Proposer",
      domains:["POLICY_PROPOSAL"]
    },
    {
      principalId:"trial-governor",
      displayName:"Trial Governor",
      domains:["TRIAL_GOVERNANCE"]
    },
    {
      principalId:"reviewer-a",
      displayName:"Reviewer A",
      domains:["POLICY_REVIEW"]
    },
    {
      principalId:"reviewer-b",
      displayName:"Reviewer B",
      domains:["POLICY_REVIEW"]
    },
    {
      principalId:"activator",
      displayName:"Policy Activator",
      domains:["POLICY_ACTIVATION"]
    },
    {
      principalId:"rollback",
      displayName:"Rollback Governor",
      domains:["POLICY_ROLLBACK"]
    },
    {
      principalId:"governor-a",
      displayName:"Governor A",
      domains:["PORTFOLIO_WEIGHTS","PORTFOLIO_BUDGET","CONSTITUTION_AMENDMENT"]
    },
    {
      principalId:"governor-b",
      displayName:"Governor B",
      domains:["PORTFOLIO_WEIGHTS","PORTFOLIO_BUDGET","CONSTITUTION_AMENDMENT"]
    },
    {
      principalId:"portfolio-selector",
      displayName:"Portfolio Selector",
      domains:["PORTFOLIO_SELECTION"]
    },
    {
      principalId:"campaign-selector",
      displayName:"Campaign Selector",
      domains:["CAMPAIGN_SELECTION"]
    },
    {
      principalId:"executor",
      displayName:"Experiment Executor",
      domains:["EXPERIMENT_EXECUTION"]
    }
  ]
});

const ledger=new ConstitutionalAuthorityLedger(constitution);
const lineage="policy-revision-example";

const proposal=ledger.authorize({
  actionType:"PROPOSE_POLICY_REVISION",
  subjectFingerprint:"1".repeat(64),
  lineageKey:lineage,
  approvals:[{
    principalId:"proposer",
    approvalReceipt:"example:proposal"
  }]
});

const trial=ledger.authorize({
  actionType:"APPROVE_POLICY_TRIAL",
  subjectFingerprint:"2".repeat(64),
  lineageKey:lineage,
  approvals:[{
    principalId:"trial-governor",
    approvalReceipt:"example:trial"
  }]
});

const review=ledger.authorize({
  actionType:"REVIEW_POLICY_PROMOTION",
  subjectFingerprint:"3".repeat(64),
  lineageKey:lineage,
  approvals:[
    {principalId:"reviewer-a",approvalReceipt:"example:review-a"},
    {principalId:"reviewer-b",approvalReceipt:"example:review-b"}
  ]
});

const activation=ledger.authorize({
  actionType:"ACTIVATE_POLICY",
  subjectFingerprint:"3".repeat(64),
  lineageKey:lineage,
  approvals:[{
    principalId:"activator",
    approvalReceipt:"example:activation"
  }]
});

console.log(JSON.stringify({
  constitution,
  authorizations:{proposal,trial,review,activation},
  ledger:ledger.export()
},null,2));
