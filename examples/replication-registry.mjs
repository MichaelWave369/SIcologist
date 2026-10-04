import {
  ReplicationEvidenceRegistry,
  createReplicationReceipt
} from "../src/index.js";

// Rung 13 consumes a frozen Rung 12 protocol plus verified replication receipts.
// In a real workflow these JSON artifacts can arrive from separate labs.

const protocol=JSON.parse(process.env.SICOLOGIST_PROTOCOL_JSON??"null");
const receipts=JSON.parse(process.env.SICOLOGIST_RECEIPTS_JSON??"[]");

if(!protocol){
  console.log(JSON.stringify({
    status:"EXAMPLE_INPUT_REQUIRED",
    instruction:"Set SICOLOGIST_PROTOCOL_JSON and SICOLOGIST_RECEIPTS_JSON to exported Rung 12 artifacts."
  },null,2));
}else{
  const registry=new ReplicationEvidenceRegistry(protocol);
  for(const receipt of receipts) registry.register(receipt);
  console.log(JSON.stringify(registry.summary(),null,2));
}
