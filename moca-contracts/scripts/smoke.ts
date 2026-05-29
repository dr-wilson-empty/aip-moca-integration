// Live smoke test against the deployed AipRegistry on Moca testnet.
// Runs a full lifecycle (register -> read -> deregister) with real transactions,
// then leaves the registry clean. Run:
//   npx hardhat run scripts/smoke.ts --network mocaTestnet
import { network } from "hardhat";

// Mirror of src/lib/moca/deployments.ts (testnet). Kept inline so this script
// stays self-contained within moca-contracts.
const REGISTRY = "0x6caea13e7d5fbC4bDa28414C9aa97799fac68c36" as `0x${string}`;

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const registry = await viem.getContractAt("AipRegistry", REGISTRY);

console.log("Deployer:", deployer.account.address);
console.log("Registry:", REGISTRY);
console.log("totalAgents (before):", await registry.read.totalAgents());

const did = `did:aip:${deployer.account.address}:smoke-test`;
const caps = [{ name: "smoke.ping", description: "live smoke test on Moca testnet" }];

console.log("\n-> registerAgent ...");
const regTx = await registry.write.registerAgent([
  "smoke-test",
  did,
  "Smoke Test Agent",
  "https://example.com/smoke",
  deployer.account.address,
  1, // AgentType.Task
  caps,
  100000n, // 0.10 USDC (micro)
  "0.1.0",
]);
await publicClient.waitForTransactionReceipt({ hash: regTx });
console.log("   tx:", regTx);

const rec = await registry.read.getAgent([deployer.account.address, "smoke-test"]);
console.log("   read back -> name:", rec.name, "| did:", rec.did);
console.log("   caps:", rec.capabilities.length, "| price:", rec.pricePerTask, "| type:", rec.agentType);
console.log("   isAgentOnChain:", await registry.read.isAgentOnChain([deployer.account.address, "smoke-test"]));
console.log("   totalAgents:", await registry.read.totalAgents());

console.log("\n-> deregisterAgent (cleanup) ...");
const delTx = await registry.write.deregisterAgent(["smoke-test"]);
await publicClient.waitForTransactionReceipt({ hash: delTx });
console.log("   tx:", delTx);
console.log("   isAgentOnChain (after):", await registry.read.isAgentOnChain([deployer.account.address, "smoke-test"]));
console.log("   totalAgents:", await registry.read.totalAgents());

console.log("\nLive smoke test passed on Moca testnet.");
