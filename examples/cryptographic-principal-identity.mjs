import {generateKeyPairSync} from "node:crypto";
import {
  ConstitutionalAuthorityLedger,
  PrincipalKeyRegistry,
  createPolicyConstitution,
  createSignedPrincipalApproval,
  authorizeCryptographically
} from "../src/index.js";

function pair(){
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  return {
    publicKeyPem:publicKey.export({type:"spki",format:"pem"}).toString(),
    privateKeyPem:privateKey.export({type:"pkcs8",format:"pem"}).toString()
  };
}

const constitution=createPolicyConstitution({
  constitutionId:"identity-example",
  principals:[
    {principalId:"governor-a",displayName:"Governor A",domains:["PORTFOLIO_BUDGET"]},
    {principalId:"governor-b",displayName:"Governor B",domains:["PORTFOLIO_BUDGET"]}
  ],
  rules:[{
    actionType:"CHANGE_PORTFOLIO_BUDGET",
    requiredDomains:["PORTFOLIO_BUDGET"],
    quorum:2,
    requiresPriorActions:[],
    separateFromActions:[]
  }]
});

const keyRegistry=new PrincipalKeyRegistry(constitution);
const authorityLedger=new ConstitutionalAuthorityLedger(constitution);

const keyA=pair();
const keyB=pair();

keyRegistry.enrollKey({
  principalId:"governor-a",
  keyId:"governor-a-1",
  publicKeyPem:keyA.publicKeyPem,
  privateKeyPem:keyA.privateKeyPem,
  bootstrapReceipt:"example-bootstrap-a"
});

keyRegistry.enrollKey({
  principalId:"governor-b",
  keyId:"governor-b-1",
  publicKeyPem:keyB.publicKeyPem,
  privateKeyPem:keyB.privateKeyPem,
  bootstrapReceipt:"example-bootstrap-b"
});

const action={
  actionType:"CHANGE_PORTFOLIO_BUDGET",
  subjectFingerprint:"a".repeat(64),
  lineageKey:"budget-example"
};

const signedApprovals=[
  createSignedPrincipalApproval(keyRegistry,constitution,{
    ...action,
    principalId:"governor-a",
    keyId:"governor-a-1",
    privateKeyPem:keyA.privateKeyPem
  }),
  createSignedPrincipalApproval(keyRegistry,constitution,{
    ...action,
    principalId:"governor-b",
    keyId:"governor-b-1",
    privateKeyPem:keyB.privateKeyPem
  })
];

const attestation=authorizeCryptographically(
  authorityLedger,
  keyRegistry,
  {...action,signedApprovals}
);

console.log(JSON.stringify({
  keyRegistry:keyRegistry.export(),
  attestation
},null,2));
