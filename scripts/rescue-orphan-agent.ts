/**
 * One-shot rescue for an orphan hosted agent — re-register the on-chain
 * AgentRecord PDA using the owner's keypair. Used when an agent's PDA
 * was previously force-closed (e.g. because it was written under an
 * older program schema) but the marketplace record still lives in
 * Supabase.
 *
 * Reads the secret key from RESCUE_PRIVATE_KEY env var (base58, 64
 * bytes) so the key never lands in shell history or a file. The
 * script verifies the derived pubkey matches the owner_address column
 * in Supabase, fetches the agent config, and submits register_agent.
 *
 * Usage:
 *   RESCUE_PRIVATE_KEY=<base58> npx tsx scripts/rescue-orphan-agent.ts <agent_id>
 */
import { readFileSync } from "node:fs";
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

try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* */ }

import { createClient } from "@supabase/supabase-js";

const REGISTRY_PROGRAM_ID = new PublicKey("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");
const REGISTER_DISC = Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]);

const AGENT_TYPE = { LLM: 0, Task: 1, Execution: 2 } as const;

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4); len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}
function borshU8(n: number): Buffer { return Buffer.from([n]); }
function borshU64(n: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); return b; }
function borshCapabilities(caps: { name: string; description: string }[]): Buffer {
  const count = Buffer.alloc(4); count.writeUInt32LE(caps.length, 0);
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

async function main() {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error("Usage: RESCUE_PRIVATE_KEY=<base58> npx tsx scripts/rescue-orphan-agent.ts <agent_id>");
    process.exit(1);
  }
  const secret = process.env.RESCUE_PRIVATE_KEY;
  if (!secret) {
    console.error("RESCUE_PRIVATE_KEY env var is required (base58 64-byte secret).");
    process.exit(1);
  }

  let signer: Keypair;
  try {
    signer = Keypair.fromSecretKey(bs58.decode(secret));
  } catch (err) {
    console.error("Failed to decode RESCUE_PRIVATE_KEY as base58/64-byte secret:", err);
    process.exit(1);
  }

  const owner = signer.publicKey.toBase58();
  console.log(`Signer pubkey: ${owner}`);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row, error } = await supabase
    .from("hosted_agents")
    .select("agent_id, owner_address, name, capabilities_json, active, is_public")
    .eq("agent_id", agentId)
    .single();

  if (error || !row) {
    console.error(`hosted_agents row for agent_id="${agentId}" not found:`, error?.message);
    process.exit(1);
  }
  if (row.owner_address !== owner) {
    console.error(`Pubkey mismatch — signer ${owner}, hosted_agents owner ${row.owner_address}.`);
    process.exit(1);
  }

  type CapRow = { id: string; description: string; pricing?: { amount?: string } };
  let caps: CapRow[] = [];
  try { caps = JSON.parse(row.capabilities_json); } catch { /* */ }
  if (caps.length === 0) {
    console.error("Agent has no capabilities in Supabase.");
    process.exit(1);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const did = `did:aip:${owner}:${agentId}`;
  const endpoint = `${appUrl}/api/hosted-agent?agentId=${agentId}`;
  const onChainCaps = caps.slice(0, 8).map((c) => ({
    name: c.id.slice(0, 32),
    description: c.description.slice(0, 64),
  }));
  let priceMin = Infinity;
  for (const c of caps) { const n = Number(c.pricing?.amount ?? 0); if (Number.isFinite(n) && n > 0 && n < priceMin) priceMin = n; }
  const pricePerTask = priceMin === Infinity ? BigInt(0) : BigInt(Math.round(priceMin * 1_000_000));

  const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const sol = await connection.getBalance(signer.publicKey);
  console.log(`Balance: ${(sol / 1e9).toFixed(4)} SOL`);
  if (sol < 1_000_000) {
    console.error("Insufficient SOL for rent. Need at least ~0.001 SOL.");
    process.exit(1);
  }

  const pda = derivePDA(signer.publicKey, agentId);
  const info = await connection.getAccountInfo(pda);
  if (info !== null) {
    console.error(`PDA ${pda.toBase58()} already exists (${info.data.length} bytes). Aborting.`);
    process.exit(1);
  }

  const data = Buffer.concat([
    REGISTER_DISC,
    borshString(agentId),
    borshString(did),
    borshString(row.name),
    borshString(endpoint),
    signer.publicKey.toBuffer(),       // wallet_address = owner
    borshU8(AGENT_TYPE.Task),          // hosted agents are always Task
    borshCapabilities(onChainCaps),
    borshU64(pricePerTask),
    borshString("1.0.0"),
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

  console.log(`Registering ${did}…`);
  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer]);
  console.log(`Done. tx: ${sig}`);
  console.log(`pda: ${pda.toBase58()}`);
}

main().catch((err) => {
  console.error("[rescue-orphan-agent] FATAL:", err?.message ?? err);
  process.exitCode = 1;
});
