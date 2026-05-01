/**
 * End-to-end resolver test against the live Devnet program.
 *
 * Registers a fresh agent via Anchor, resolves it through the
 * standalone resolver, and asserts the constructed DID Document
 * matches the on-chain record. Then deregisters to return rent.
 *
 * Skipped automatically when SOLANA_DEVNET_KEYPAIR is not set so that
 * CI without funded keys still passes the unit tests.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { AipDidResolver, formatDid } from "../src/index.js";

const PROGRAM_ID = new PublicKey("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");
const RPC = "https://api.devnet.solana.com";

function loadOwner(): Keypair | null {
  const explicit = process.env.SOLANA_DEVNET_KEYPAIR;
  const candidate = explicit
    ? explicit
    : path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(candidate)) return null;
  const raw = JSON.parse(fs.readFileSync(candidate, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function discriminator(name: string): Uint8Array {
  // Anchor instruction discriminator = sha256("global:<snake_case_name>")[0..8]
  return Uint8Array.from(createHash("sha256").update(`global:${name}`).digest()).subarray(0, 8);
}

function encodeString(s: string): Uint8Array {
  const b = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + b.length);
  new DataView(out.buffer).setUint32(0, b.length, true);
  out.set(b, 4);
  return out;
}

function encodeU32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}

function encodeU64(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

test("resolver round-trip against live Devnet", { skip: loadOwner() === null }, async () => {
  const owner = loadOwner()!;
  const conn = new Connection(RPC, "confirmed");

  const balance = await conn.getBalance(owner.publicKey);
  if (balance < 0.05 * 1e9) {
    console.warn(`skipping: insufficient SOL on ${owner.publicKey.toBase58()}`);
    return;
  }

  const agentId = `rslv-${Date.now().toString(36)}`;
  const did = formatDid(owner.publicKey.toBase58(), agentId);
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.publicKey.toBuffer(), Buffer.from(agentId)],
    PROGRAM_ID,
  );

  // ----- Build register_agent instruction manually -----
  const capName = "echo";
  const capDesc = "Returns its input verbatim";
  const ixData = concat(
    discriminator("register_agent"),
    encodeString(agentId),
    encodeString(did),
    encodeString("Resolver Test Agent"),
    encodeString("https://resolver.test/agent"),
    owner.publicKey.toBytes(),                // wallet_address
    Uint8Array.from([2]),                     // AgentType::Execution
    encodeU32(1),                             // 1 capability
    encodeString(capName),
    encodeString(capDesc),
    encodeU64(500_000n),                      // price_per_task
    encodeString("0.0.1"),                    // version
  );

  const registerIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: pda,             isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(ixData),
  });

  await sendAndConfirmTransaction(conn, new Transaction().add(registerIx), [owner]);

  // ----- Resolve through the standalone resolver -----
  const resolver = new AipDidResolver({ rpcEndpoint: RPC, network: "solana:devnet" });

  const derived = resolver.derivePda(did);
  assert.equal(derived.pda.toBase58(), pda.toBase58(), "derivePda must match find_program_address");
  assert.equal(derived.bump, bump, "bump must match");

  const result = await resolver.resolve(did);
  assert.ok(result.didDocument, "DID Document must be present");
  assert.equal(result.didDocument!.id, did);
  assert.equal(result.didDocument!.controller, did);
  assert.equal(result.didDocument!.verificationMethod[0].publicKeyMultibase, `z${owner.publicKey.toBase58()}`);
  assert.equal(result.didDocument!.service[0].serviceEndpoint, "https://resolver.test/agent");
  assert.ok(result.agentRecord, "agentRecord must be returned");
  assert.equal(result.agentRecord!.agentId, agentId);
  assert.equal(result.agentRecord!.agentType, "Execution");
  assert.equal(result.agentRecord!.capabilities.length, 1);
  assert.equal(result.agentRecord!.capabilities[0].name, capName);
  assert.equal(result.agentRecord!.pricePerTask, 500_000n);

  // ----- Cleanup: deregister and confirm resolver returns notFound -----
  const deregisterIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true,  isWritable: true },
      { pubkey: pda,             isSigner: false, isWritable: true },
    ],
    data: Buffer.from(discriminator("deregister_agent")),
  });
  await sendAndConfirmTransaction(conn, new Transaction().add(deregisterIx), [owner]);

  const after = await resolver.resolve(did);
  assert.equal(after.didDocument, null);
  assert.deepEqual(after.didResolutionMetadata, { error: "notFound" });
});
