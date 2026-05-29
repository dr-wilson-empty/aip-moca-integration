/**
 * AIP on Moca Chain — end-to-end demo.
 *
 * Ties the three Moca clients together in one real flow on Moca testnet:
 *   1. an agent registers on-chain (AipRegistry)
 *   2. a client discovers it by resolving its did:aip (AipMocaResolver)
 *   3. a task payment is escrowed in native MOCA (AipEscrow)
 *   4. the agent "works", then the escrow is released to the agent's wallet
 *   5. cleanup (deregister)
 *
 * The agent's payout wallet is a fresh address so the balance increase is
 * visible proof of settlement. Run:
 *   DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/demo.ts
 */
import { createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { AipRegistryClient, mocaTestnet, toMicroUsdc, fromMicroUsdc } from "../src/lib/moca/registry-client";
import { AipMocaResolver, formatMocaDid } from "../src/lib/moca/resolver";
import { AipEscrowClient, escrowStatusName } from "../src/lib/moca/escrow-client";
import {
  MOCA_REGISTRY_ADDRESS,
  MOCA_ESCROW_ADDRESS,
  MOCA_TESTNET_EXPLORER,
} from "../src/lib/moca/deployments";

const pk = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY env var (0x-prefixed)");

const account = privateKeyToAccount(pk);
// For the demo a single funded wallet plays the agent owner, the paying client
// and the escrow authority. The agent's payout wallet is a fresh address.
const owner = account.address;
const agentWallet = privateKeyToAccount(generatePrivateKey()).address;

const registry = new AipRegistryClient(MOCA_REGISTRY_ADDRESS.testnet as `0x${string}`);
const resolver = new AipMocaResolver();
const escrow = new AipEscrowClient(MOCA_ESCROW_ADDRESS.testnet as `0x${string}`);
const pub = createPublicClient({ chain: mocaTestnet, transport: http() });

const tx = (h: string) => `${MOCA_TESTNET_EXPLORER}/tx/${h}`;
const hr = (t: string) => console.log(`\n${"=".repeat(60)}\n${t}\n${"=".repeat(60)}`);

async function main() {
  console.log("AIP on Moca Chain — end-to-end demo");
  console.log("network :", "Moca testnet (chainId 222888)");
  console.log("registry:", MOCA_REGISTRY_ADDRESS.testnet);
  console.log("escrow  :", MOCA_ESCROW_ADDRESS.testnet);
  console.log("owner   :", owner, "(agent owner + paying client + authority)");
  console.log("agent   :", agentWallet, "(fresh payout wallet)");

  const agentId = "summary-agent";
  const did = formatMocaDid(owner, agentId);

  // idempotent: clear any leftover from a previous run
  if (await registry.isAgentOnChain(owner, agentId)) {
    const t = await registry.deregisterAgent(pk!, agentId);
    await pub.waitForTransactionReceipt({ hash: t });
  }

  hr("1) Agent registration (on-chain, AipRegistry)");
  const price = toMicroUsdc("0.10");
  const regTx = await registry.registerAgent(pk!, {
    agentId,
    did,
    name: "Summary Agent",
    endpoint: "https://agents.example.com/summary",
    walletAddress: agentWallet,
    agentType: 1, // Task
    capabilities: [{ name: "text.summarize", description: "Summarize a block of text" }],
    pricePerTask: price,
    version: "1.0.0",
  });
  await pub.waitForTransactionReceipt({ hash: regTx });
  console.log("registered:", did);
  console.log("list price:", fromMicroUsdc(price), "USDC (indicative)");
  console.log("tx        :", tx(regTx));

  hr("2) Discovery (resolve did:aip, AipMocaResolver)");
  const res = await resolver.resolve(did);
  console.log("did doc id    :", res.didDocument?.id);
  console.log("service        :", res.didDocument?.service?.[0]?.serviceEndpoint);
  console.log("capabilities   :", res.agentRecord?.capabilities.map((c) => c.name).join(", "));
  console.log("payout wallet  :", res.agentRecord?.walletAddress);

  hr("3) Task payment escrow (native MOCA, AipEscrow)");
  const taskId = `task-${Date.now()}`;
  const fee = parseEther("0.002");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const agentBefore = await pub.getBalance({ address: agentWallet });
  console.log("task          :", taskId);
  console.log("fee locked     :", formatEther(fee), "MOCA  (payer ->", "escrow)");
  const initTx = await escrow.initialize(pk!, { taskId, payee: agentWallet, authority: owner, deadline, amountWei: fee });
  await pub.waitForTransactionReceipt({ hash: initTx });
  console.log("status         :", escrowStatusName((await escrow.getEscrow(taskId)).status));
  console.log("escrow holds   :", formatEther(await pub.getBalance({ address: MOCA_ESCROW_ADDRESS.testnet as `0x${string}` })), "MOCA");
  console.log("tx             :", tx(initTx));

  hr("4) Agent executes the task");
  console.log("(agent runs off-chain via its endpoint and returns the result)");

  hr("5) Settlement (release escrow to the agent)");
  const relTx = await escrow.release(pk!, taskId);
  await pub.waitForTransactionReceipt({ hash: relTx });
  const agentAfter = await pub.getBalance({ address: agentWallet });
  console.log("status         :", escrowStatusName(await escrow.status(taskId)));
  console.log("agent balance  :", formatEther(agentBefore), "->", formatEther(agentAfter), "MOCA");
  console.log("settled        :", formatEther(agentAfter - agentBefore), "MOCA to the agent");
  console.log("tx             :", tx(relTx));

  hr("6) Cleanup");
  const delTx = await registry.deregisterAgent(pk!, agentId);
  await pub.waitForTransactionReceipt({ hash: delTx });
  console.log("agent deregistered, registry left clean");

  console.log("\nDemo complete: full AIP flow (identity + discovery + payment) on Moca testnet.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
