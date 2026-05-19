/**
 * Audit script — inspect every AgentRecord PDA owned by the AIP
 * registry program and report which ones decode successfully under
 * the corrected schema (see programs/aip-escrow/.../lib.rs).
 *
 * Useful for diagnosing the "10 legacy PDAs" issue documented in
 * onchain-agent.md §C: with the registry-program.ts decoder previously
 * miscounting the capabilities field, these accounts looked like they
 * had a discriminator mismatch. The current decoder mirrors the
 * Rust struct exactly, so this script tells us whether those records
 * are actually well-formed or are leftovers from a prior program
 * deployment.
 *
 * Usage:
 *   SOLANA_RPC_URL=https://api.devnet.solana.com \
 *   npx tsx scripts/audit-onchain-agents.ts [authorityPubkey]
 *
 * When authorityPubkey is supplied, the report highlights records
 * owned by that wallet (e.g. so the platform can plan deregistration
 * of its own legacy agents). Output is human-readable; pipe through
 * `| jq` if you want JSON (set AUDIT_JSON=1).
 */
import { Connection, PublicKey } from "@solana/web3.js";

const REGISTRY_PROGRAM_ID = new PublicKey(
  "CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc"
);
const AGENT_RECORD_DISCRIMINATOR = Buffer.from([4, 201, 129, 70, 197, 134, 47, 169]);

function readBorshString(buf: Buffer, offset: number): { value: string; newOffset: number } {
  const len = buf.readUInt32LE(offset);
  const value = buf.subarray(offset + 4, offset + 4 + len).toString("utf8");
  return { value, newOffset: offset + 4 + len };
}

interface DecodedRecord {
  pda: string;
  owner: string;
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: string;
  agentType: number;
  capabilities: { name: string; description: string }[];
  pricePerTask: string; // bigint as string
  version: string;
  registeredAt: number;
  updatedAt: number;
  bump: number;
}

interface FailedRecord {
  pda: string;
  reason: string;
  dataLen: number;
  discriminatorMatch: boolean;
}

function tryDecode(pda: string, data: Buffer): DecodedRecord | FailedRecord {
  if (data.length < 8) {
    return { pda, reason: "data too short for discriminator", dataLen: data.length, discriminatorMatch: false };
  }
  let discriminatorMatch = true;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== AGENT_RECORD_DISCRIMINATOR[i]) {
      discriminatorMatch = false;
      break;
    }
  }
  if (!discriminatorMatch) {
    return { pda, reason: "discriminator mismatch", dataLen: data.length, discriminatorMatch: false };
  }

  try {
    let offset = 8;
    const owner = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    const agentId = readBorshString(data, offset); offset = agentId.newOffset;
    const did = readBorshString(data, offset); offset = did.newOffset;
    const name = readBorshString(data, offset); offset = name.newOffset;
    const endpoint = readBorshString(data, offset); offset = endpoint.newOffset;

    const walletAddress = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    const agentType = data[offset]; offset += 1;

    const capCount = data.readUInt32LE(offset); offset += 4;
    const capabilities: { name: string; description: string }[] = [];
    for (let i = 0; i < capCount; i++) {
      const n = readBorshString(data, offset); offset = n.newOffset;
      const d = readBorshString(data, offset); offset = d.newOffset;
      capabilities.push({ name: n.value, description: d.value });
    }

    const pricePerTask = data.readBigUInt64LE(offset); offset += 8;
    const version = readBorshString(data, offset); offset = version.newOffset;

    const registeredAt = Number(data.readBigInt64LE(offset)); offset += 8;
    const updatedAt = Number(data.readBigInt64LE(offset)); offset += 8;
    const bump = data[offset];

    return {
      pda,
      owner,
      agentId: agentId.value,
      did: did.value,
      name: name.value,
      endpoint: endpoint.value,
      walletAddress,
      agentType,
      capabilities,
      pricePerTask: pricePerTask.toString(),
      version: version.value,
      registeredAt,
      updatedAt,
      bump,
    };
  } catch (err) {
    return {
      pda,
      reason: `borsh decode error: ${err instanceof Error ? err.message : String(err)}`,
      dataLen: data.length,
      discriminatorMatch: true,
    };
  }
}

async function main(): Promise<void> {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const json = process.env.AUDIT_JSON === "1";
  const focus = process.argv[2]; // optional authority pubkey

  const connection = new Connection(rpc, "confirmed");
  const accounts = await connection.getProgramAccounts(REGISTRY_PROGRAM_ID);

  const decoded: DecodedRecord[] = [];
  const failed: FailedRecord[] = [];

  for (const { pubkey, account } of accounts) {
    const result = tryDecode(pubkey.toBase58(), Buffer.from(account.data));
    if ("agentId" in result) decoded.push(result);
    else failed.push(result);
  }

  if (json) {
    console.log(JSON.stringify({ rpc, total: accounts.length, decoded, failed }, null, 2));
    return;
  }

  console.log(`AIP Registry Audit`);
  console.log(`  RPC:     ${rpc}`);
  console.log(`  Program: ${REGISTRY_PROGRAM_ID.toBase58()}`);
  console.log(`  Total accounts: ${accounts.length}`);
  console.log(`    decoded: ${decoded.length}`);
  console.log(`    failed:  ${failed.length}`);
  console.log("");

  if (decoded.length > 0) {
    console.log("Decoded records:");
    for (const r of decoded) {
      const tag = focus && r.owner === focus ? " ← OWNED BY FOCUS WALLET" : "";
      console.log(`  • ${r.did}${tag}`);
      console.log(`      pda:      ${r.pda}`);
      console.log(`      owner:    ${r.owner}`);
      console.log(`      agent_id: ${r.agentId}`);
      console.log(`      name:     ${r.name}`);
      console.log(`      endpoint: ${r.endpoint}`);
      console.log(`      caps:     ${r.capabilities.length} (${r.capabilities.map((c) => c.name).join(", ")})`);
      console.log(`      version:  ${r.version}`);
      console.log("");
    }
  }

  if (failed.length > 0) {
    console.log("Failed records (need program-level cleanup or are unrelated accounts):");
    for (const r of failed) {
      console.log(`  • ${r.pda}`);
      console.log(`      reason:        ${r.reason}`);
      console.log(`      discriminator: ${r.discriminatorMatch ? "matches AgentRecord" : "does not match"}`);
      console.log(`      data length:   ${r.dataLen} bytes`);
      console.log("");
    }
  }

  if (focus) {
    const owned = decoded.filter((r) => r.owner === focus);
    console.log(`Focus wallet (${focus}) owns ${owned.length} decoded record(s).`);
    if (owned.length > 0) {
      console.log("Deregister candidates (run with that wallet as signer):");
      for (const r of owned) {
        console.log(`  agent_id="${r.agentId}"  pda=${r.pda}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("[audit-onchain-agents] FATAL:", err);
  process.exitCode = 1;
});
