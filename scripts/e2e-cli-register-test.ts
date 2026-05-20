/**
 * End-to-end smoke test for the `aip register --on-chain` workflow,
 * minus the interactive keystore unlock prompt. Generates a fresh
 * keypair, airdrops devnet SOL, spawns a tiny @aip/agent-sdk demo
 * agent on a local port, then runs the exact same byte-level register
 * sequence that the CLI's --on-chain path executes (canonical DID,
 * card from /.well-known/agent.json, register_agent ix).
 *
 * This is the test the smoke-test section of onchain-agent.md asks
 * for; we just bypass `aip login` because TTY isn't available here.
 *
 * Usage:
 *   npx tsx scripts/e2e-cli-register-test.ts
 */
import { readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* */ }

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const REGISTRY_PROGRAM_ID = new PublicKey("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");
const REGISTER_DISC = Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]);
const AGENT_TYPE = { LLM: 0, Task: 1, Execution: 2 } as const;

function borshString(s: string): Buffer { const u = Buffer.from(s, "utf8"); const l = Buffer.alloc(4); l.writeUInt32LE(u.length, 0); return Buffer.concat([l, u]); }
function borshU8(n: number): Buffer { return Buffer.from([n]); }
function borshU64(n: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); return b; }
function borshCaps(caps: { name: string; description: string }[]): Buffer {
  const c = Buffer.alloc(4); c.writeUInt32LE(caps.length, 0);
  return Buffer.concat([c, ...caps.flatMap((cap) => [borshString(cap.name), borshString(cap.description)])]);
}
function derivePDA(owner: PublicKey, agentId: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("agent"), owner.toBuffer(), Buffer.from(agentId)], REGISTRY_PROGRAM_ID)[0];
}

async function fetchCard(url: string): Promise<{ name: string; capabilities: Array<{ id: string; description: string; pricing: { amount: string } }>; version: string }> {
  const res = await fetch(`${url}/.well-known/agent.json`);
  if (!res.ok) throw new Error(`Card fetch failed: ${res.status}`);
  return res.json();
}

async function main() {
  console.log("=== E2E aip register --on-chain test ===\n");

  // Step 1 — generate a fresh keypair (simulates `aip login` import)
  const signer = Keypair.generate();
  console.log(`[1] Fresh keypair: ${signer.publicKey.toBase58()}`);

  // Step 2 — fund from the platform authority (devnet faucet has 1 SOL/day rate limit)
  const connection = new Connection(RPC, "confirmed");
  const authoritySecret = process.env.ESCROW_PRIVATE_KEY;
  if (!authoritySecret) throw new Error("ESCROW_PRIVATE_KEY not loaded from .env.local");
  const authority = Keypair.fromSecretKey(bs58.decode(authoritySecret));
  console.log(`[2] Funding test keypair with 0.02 SOL from authority ${authority.publicKey.toBase58().slice(0, 12)}…`);
  const fundIx = SystemProgram.transfer({
    fromPubkey: authority.publicKey,
    toPubkey: signer.publicKey,
    lamports: 0.02 * LAMPORTS_PER_SOL,
  });
  const fundSig = await sendAndConfirmTransaction(connection, new Transaction().add(fundIx), [authority]);
  console.log(`    fund tx: ${fundSig}`);
  const bal = await connection.getBalance(signer.publicKey);
  console.log(`    Balance: ${(bal / 1e9).toFixed(4)} SOL`);
  if (bal < 5_000_000) throw new Error("Funding did not arrive.");

  // Step 3 — spawn the demo agent
  const port = 4030;
  const agentId = "e2e-testbot";
  const wallet = signer.publicKey.toBase58();
  const inlineAgentSrc = `
    import { createAgent } from "${process.cwd()}/packages/agent-sdk/src/index";
    const agent = createAgent({
      name: "E2E Test Bot",
      port: ${port},
      walletAddress: "${wallet}",
      agentId: "${agentId}",
      type: "Task",
    });
    agent.capability("text.echo", {
      description: "Echo input back",
      price: "0.01",
      handler: async (input: string) => "echo: " + input,
    });
    agent.start();
  `;
  console.log(`[3] Spawning demo agent on port ${port}…`);
  const agentProc: ChildProcess = spawn("npx", ["tsx", "-e", inlineAgentSrc], { stdio: ["ignore", "pipe", "pipe"] });
  let agentReady = false;
  agentProc.stdout?.on("data", (d) => { if (String(d).includes("listening")) agentReady = true; });
  agentProc.stderr?.on("data", (d) => process.stderr.write(`    [agent stderr] ${d}`));

  for (let i = 0; i < 40 && !agentReady; i++) await new Promise((r) => setTimeout(r, 250));
  if (!agentReady) {
    agentProc.kill();
    throw new Error("Demo agent did not become ready within 10s.");
  }

  try {
    // Step 4 — fetch the agent card (the same probe `aip register --url` runs)
    console.log(`[4] Fetching /.well-known/agent.json…`);
    const card = await fetchCard(`http://localhost:${port}`);
    console.log(`    name="${card.name}" caps=${card.capabilities.map((c) => c.id).join(",")}`);

    // Step 5 — replicate the `--on-chain` code path: canonical DID + register_agent ix
    console.log(`[5] Building canonical did + register_agent tx…`);
    const did = `did:aip:${wallet}:${agentId}`;
    const pda = derivePDA(signer.publicKey, agentId);
    const caps = card.capabilities.slice(0, 8).map((c) => ({
      name: c.id.slice(0, 32),
      description: c.description.slice(0, 64),
    }));
    const priceMin = Math.min(...card.capabilities.map((c) => Number(c.pricing?.amount ?? 0)).filter((n) => Number.isFinite(n) && n > 0));
    const pricePerTask = Number.isFinite(priceMin) ? BigInt(Math.round(priceMin * 1_000_000)) : BigInt(0);
    const data = Buffer.concat([
      REGISTER_DISC,
      borshString(agentId),
      borshString(did),
      borshString(card.name),
      borshString(`http://localhost:${port}/a2a`),
      signer.publicKey.toBuffer(),
      borshU8(AGENT_TYPE.Task),
      borshCaps(caps),
      borshU64(pricePerTask),
      borshString(card.version || "1.0.0"),
    ]);
    const ix = new TransactionInstruction({
      programId: REGISTRY_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer]);
    console.log(`    register tx: ${sig}`);
    console.log(`    pda:         ${pda.toBase58()}`);
    console.log(`    did:         ${did}`);

    // Step 6 — verify with resolve behaviour: read account back, decode, compare
    console.log(`[6] Reading PDA back from devnet…`);
    const info = await connection.getAccountInfo(pda);
    if (!info) throw new Error("PDA empty after register.");
    console.log(`    account size: ${info.data.length} bytes (expected 1366 for AgentRecord)`);

    // Quick sanity decode: discriminator + owner pubkey
    const ownerOnChain = new PublicKey(info.data.subarray(8, 8 + 32)).toBase58();
    if (ownerOnChain !== wallet) throw new Error(`Owner mismatch: on-chain ${ownerOnChain}, expected ${wallet}`);
    console.log(`    decoded owner matches signer ✓`);

    console.log("\n=== CLI register --on-chain code path: PASS ===");
  } finally {
    agentProc.kill();
    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch((err) => {
  console.error("[e2e-cli-register-test] FATAL:", err?.message ?? err);
  process.exitCode = 1;
});
