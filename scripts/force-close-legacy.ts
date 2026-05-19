/**
 * Force-close every AgentRecord-owned account that the current decoder
 * cannot deserialize. Uses the `force_close_legacy` instruction added
 * in the program upgrade — only the platform authority (program upgrade
 * authority, base58 `33qU3J…`) can call it.
 *
 * The keypair is loaded from `~/.config/solana/id.json` (the same
 * keypair Solana CLI defaults to). Decoded accounts are left alone.
 *
 * Usage:
 *   npx tsx scripts/force-close-legacy.ts            # dry-run
 *   npx tsx scripts/force-close-legacy.ts --apply    # actually send
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local */ }

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const apply = process.argv.includes("--apply");

const REGISTRY_PROGRAM_ID = new PublicKey("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");
const AGENT_RECORD_DISCRIMINATOR = Buffer.from([4, 201, 129, 70, 197, 134, 47, 169]);
const FORCE_CLOSE_DISCRIMINATOR = Buffer.from([13, 233, 234, 43, 131, 10, 20, 167]);

function loadCliKeypair(): Keypair {
  const path = `${homedir()}/.config/solana/id.json`;
  const raw = readFileSync(path, "utf8");
  const arr = JSON.parse(raw) as number[];
  if (!Array.isArray(arr) || arr.length !== 64) {
    throw new Error(`${path} is not a 64-byte keypair JSON array`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function tryDecode(data: Buffer): "ok" | "fail-current-schema" | "not-an-agent-record" {
  if (data.length < 8) return "not-an-agent-record";
  for (let i = 0; i < 8; i++) {
    if (data[i] !== AGENT_RECORD_DISCRIMINATOR[i]) return "not-an-agent-record";
  }
  try {
    let offset = 8;
    // owner (32)
    offset += 32;
    // agent_id, did, name, endpoint (4 strings)
    for (let s = 0; s < 4; s++) {
      const len = data.readUInt32LE(offset);
      offset += 4 + len;
    }
    // wallet (32)
    offset += 32;
    // agent_type (1)
    offset += 1;
    // capabilities Vec
    const capCount = data.readUInt32LE(offset);
    offset += 4;
    for (let i = 0; i < capCount; i++) {
      const nameLen = data.readUInt32LE(offset);
      offset += 4 + nameLen;
      const descLen = data.readUInt32LE(offset);
      offset += 4 + descLen;
    }
    // price_per_task (8)
    offset += 8;
    // version
    const verLen = data.readUInt32LE(offset);
    offset += 4 + verLen;
    // registered_at, updated_at (8+8)
    offset += 16;
    // bump (1)
    offset += 1;
    return offset <= data.length ? "ok" : "fail-current-schema";
  } catch {
    return "fail-current-schema";
  }
}

function buildForceCloseIx(authority: PublicKey, target: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: target,    isSigner: false, isWritable: true },
    ],
    data: FORCE_CLOSE_DISCRIMINATOR,
  });
}

async function main(): Promise<void> {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`RPC: ${RPC}`);

  const authority = loadCliKeypair();
  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  if (authority.publicKey.toBase58() !== "33qU3JFkrehB2HkgdHzcpj9gDkFk8c2okQC51REWhjKh") {
    console.error("Authority mismatch — CLI keypair must be the program upgrade authority.");
    process.exit(1);
  }

  const connection = new Connection(RPC, "confirmed");
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  const accounts = await connection.getProgramAccounts(REGISTRY_PROGRAM_ID);
  console.log(`\nProgram accounts: ${accounts.length}`);

  const legacy: { pda: PublicKey; lamports: number; bytes: number; reason: string }[] = [];
  for (const { pubkey, account } of accounts) {
    const status = tryDecode(Buffer.from(account.data));
    if (status === "ok") {
      console.log(`  ✓ keeping ${pubkey.toBase58()} (decoded under current schema)`);
    } else {
      legacy.push({ pda: pubkey, lamports: account.lamports, bytes: account.data.length, reason: status });
      console.log(`  ✗ legacy ${pubkey.toBase58()}  ${account.data.length}B  ${(account.lamports / 1e9).toFixed(5)} SOL  ${status}`);
    }
  }
  const recoverable = legacy.reduce((s, x) => s + x.lamports, 0);
  console.log(`\n${legacy.length} legacy account(s); rent recoverable: ${(recoverable / 1e9).toFixed(5)} SOL`);

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to send force_close_legacy txs.");
    return;
  }

  let closed = 0;
  for (const item of legacy) {
    try {
      const tx = new Transaction().add(buildForceCloseIx(authority.publicKey, item.pda));
      const sig = await sendAndConfirmTransaction(connection, tx, [authority]);
      console.log(`  closed ${item.pda.toBase58()} → tx ${sig}`);
      closed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED ${item.pda.toBase58()}: ${msg}`);
    }
  }
  console.log(`\nClosed ${closed}/${legacy.length}`);
}

main().catch((err) => {
  console.error("[force-close-legacy] FATAL:", err);
  process.exitCode = 1;
});
