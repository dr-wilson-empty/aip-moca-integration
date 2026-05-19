/**
 * One-shot bootstrap — for each platform demo agent, close any
 * existing AgentRecord PDA owned by the authority wallet and then
 * register a fresh one using the canonical schema.
 *
 * Why this exists: prior program deployments wrote AgentRecords
 * under the same PDA seeds but with a different byte layout, so
 * the current decoder rejects them. Boot-time seed-agents.ts sees
 * `isAgentOnChain` return true and skips registration, leaving the
 * marketplace pointing at undecodable records. Run this once
 * (preferably before the dev server boots so seed-agents has clean
 * slate to write into).
 *
 * Usage:
 *   npx tsx scripts/reseed-demo-agents.ts            # dry-run
 *   npx tsx scripts/reseed-demo-agents.ts --apply    # actually do it
 *
 * Reads .env.local for ESCROW_PRIVATE_KEY and SOLANA_RPC_URL.
 */
import { readFileSync } from "node:fs";
try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local */ }

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SECRET = process.env.ESCROW_PRIVATE_KEY;
if (!SECRET) {
  console.error("Missing ESCROW_PRIVATE_KEY in .env.local");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

const REGISTRY_PROGRAM_ID = new PublicKey("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");

const DISCRIMINATORS = {
  register_agent:   Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]),
  deregister_agent: Buffer.from([227, 208, 166, 164, 48, 69, 111, 1]),
};

const AGENT_TYPE = { Llm: 0, Task: 1, Execution: 2 } as const;

interface Cap { id: string; description: string; price: number; }
interface DemoSpec {
  agentId: string;
  name: string;
  version: string;
  agentType: number;
  capabilities: Cap[];
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

const DEMOS: DemoSpec[] = [
  {
    agentId: "summary-agent",
    name: "Summary Agent",
    version: "1.2.0",
    agentType: AGENT_TYPE.Task,
    capabilities: [
      { id: "text.summarize", description: "Summarize Text", price: 0.10 },
      { id: "text.classify", description: "Classify Text", price: 0.05 },
    ],
  },
  {
    agentId: "data-agent",
    name: "Data Agent",
    version: "2.0.1",
    agentType: AGENT_TYPE.Task,
    capabilities: [
      { id: "data.retrieve", description: "Retrieve Data", price: 0.25 },
    ],
  },
  {
    agentId: "audit-agent",
    name: "Audit Agent",
    version: "1.0.3",
    agentType: AGENT_TYPE.Execution,
    capabilities: [
      { id: "code.audit", description: "Smart Contract Audit", price: 0.75 },
      { id: "defi.analyze", description: "DeFi Risk Analysis", price: 0.40 },
    ],
  },
  {
    agentId: "web-search",
    name: "Web Search Agent",
    version: "1.0.0",
    agentType: AGENT_TYPE.Task,
    capabilities: [
      { id: "web.search", description: "Web Search", price: 0.02 },
    ],
  },
];

/* ---- Borsh helpers (mirror src/lib/solana/registry-program.ts) ---- */

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}
function borshU8(n: number): Buffer { return Buffer.from([n]); }
function borshU64(n: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); return b; }
function borshPubkey(pk: PublicKey): Buffer { return pk.toBuffer(); }
function borshCapabilities(caps: { name: string; description: string }[]): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32LE(caps.length, 0);
  const parts: Buffer[] = [count];
  for (const c of caps) { parts.push(borshString(c.name)); parts.push(borshString(c.description)); }
  return Buffer.concat(parts);
}

function derivePDA(owner: PublicKey, agentId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), Buffer.from(agentId)],
    REGISTRY_PROGRAM_ID,
  );
  return pda;
}

function endpointFor(agentId: string): string {
  if (agentId === "web-search") return `${APP_URL}/api/web/agent`;
  return `${APP_URL}/api/hosted-agent?agentId=${agentId}`;
}

function pricePerTask(caps: Cap[]): bigint {
  if (caps.length === 0) return BigInt(0);
  const min = Math.min(...caps.map((c) => c.price));
  if (!isFinite(min) || min <= 0) return BigInt(0);
  return BigInt(Math.round(min * 1_000_000));
}

function buildRegisterIx(owner: PublicKey, demo: DemoSpec): TransactionInstruction {
  const pda = derivePDA(owner, demo.agentId);
  const did = `did:aip:${owner.toBase58()}:${demo.agentId}`;
  const caps = demo.capabilities.slice(0, 8).map((c) => ({
    name: c.id.slice(0, 32),
    description: c.description.slice(0, 64),
  }));
  const data = Buffer.concat([
    DISCRIMINATORS.register_agent,
    borshString(demo.agentId),
    borshString(did),
    borshString(demo.name),
    borshString(endpointFor(demo.agentId)),
    borshPubkey(owner),
    borshU8(demo.agentType),
    borshCapabilities(caps),
    borshU64(pricePerTask(demo.capabilities)),
    borshString(demo.version),
  ]);
  return new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildDeregisterIx(owner: PublicKey, agentId: string): TransactionInstruction {
  const pda = derivePDA(owner, agentId);
  return new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
    ],
    data: DISCRIMINATORS.deregister_agent,
  });
}

async function main(): Promise<void> {
  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.fromSecretKey(bs58.decode(SECRET!));
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`RPC: ${RPC}`);
  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  console.log("");

  for (const demo of DEMOS) {
    const pda = derivePDA(authority.publicKey, demo.agentId);
    const info = await connection.getAccountInfo(pda);
    const exists = info !== null;
    console.log(`# ${demo.agentId}`);
    console.log(`  pda:    ${pda.toBase58()}`);
    console.log(`  exists: ${exists}${exists ? ` (${info!.data.length} bytes)` : ""}`);

    if (!apply) {
      console.log(`  plan:   ${exists ? "deregister → register" : "register"}`);
      console.log("");
      continue;
    }

    try {
      if (exists) {
        const tx = new Transaction().add(buildDeregisterIx(authority.publicKey, demo.agentId));
        const sig = await sendAndConfirmTransaction(connection, tx, [authority]);
        console.log(`  deregister tx: ${sig}`);
      }
      const tx2 = new Transaction().add(buildRegisterIx(authority.publicKey, demo));
      const sig2 = await sendAndConfirmTransaction(connection, tx2, [authority]);
      console.log(`  register tx:   ${sig2}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${msg}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("[reseed-demo-agents] FATAL:", err);
  process.exitCode = 1;
});
