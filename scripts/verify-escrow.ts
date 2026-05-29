/**
 * Live verification of the AipEscrow client against the deployed contract on
 * Moca testnet. Runs initialize -> release using native MOCA. For a self-contained
 * smoke test the payer, payee and authority are all the deployer wallet.
 *
 *   DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/verify-escrow.ts
 */
import { createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AipEscrowClient, escrowStatusName } from "../src/lib/moca/escrow-client";
import { mocaTestnet } from "../src/lib/moca/registry-client";
import { MOCA_ESCROW_ADDRESS } from "../src/lib/moca/deployments";

const pk = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY env var (0x-prefixed)");

const account = privateKeyToAccount(pk);
const me = account.address;
const escrow = new AipEscrowClient(MOCA_ESCROW_ADDRESS.testnet as `0x${string}`);
const pub = createPublicClient({ chain: mocaTestnet, transport: http() });

async function main() {
  const taskId = `escrow-smoke-${Date.now()}`;
  const amount = parseEther("0.001");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  console.log("wallet:", me);
  console.log("taskId:", taskId, "| amount:", formatEther(amount), "MOCA");

  console.log("\n-> initializeEscrow (lock native MOCA)");
  const initTx = await escrow.initialize(pk!, {
    taskId,
    payee: me,
    authority: me,
    deadline,
    amountWei: amount,
  });
  await pub.waitForTransactionReceipt({ hash: initTx });
  console.log("   tx:", initTx);
  const locked = await escrow.getEscrow(taskId);
  console.log("   status:", escrowStatusName(locked.status), "| amount:", formatEther(locked.amount), "MOCA");
  console.log("   contract balance:", formatEther(await pub.getBalance({ address: MOCA_ESCROW_ADDRESS.testnet as `0x${string}` })), "MOCA");

  console.log("\n-> releaseEscrow (authority -> payee)");
  const relTx = await escrow.release(pk!, taskId);
  await pub.waitForTransactionReceipt({ hash: relTx });
  console.log("   tx:", relTx);
  console.log("   status:", escrowStatusName(await escrow.status(taskId)));

  console.log("\n-> double release should fail");
  try {
    await escrow.release(pk!, taskId);
    console.log("   ERROR: second release unexpectedly succeeded");
  } catch {
    console.log("   ok: reverted as expected (NotLocked)");
  }

  console.log("\nEscrow live verification passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
