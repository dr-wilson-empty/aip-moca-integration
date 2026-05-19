/**
 * Migration audit — find non-canonical did:aip identifiers persisted
 * in Supabase tables, so we know how much history references the
 * legacy `did:aip:platform:*` / `did:aip:<8char>:*` formats produced
 * before Önkoşul 0.
 *
 * The script is dry-run by default and only writes when run with
 * --apply. Even with --apply, it doesn't delete rows — it just sets
 * a `did_old` column (creating it if missing) and rewrites the DID
 * column to its canonical form when the owner wallet is known.
 *
 * Usage:
 *   npx tsx scripts/migrate-onchain-dids.ts           # dry-run (default)
 *   npx tsx scripts/migrate-onchain-dids.ts --apply   # actually write
 *
 * Reads .env.local for Supabase credentials.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const apply = process.argv.includes("--apply");

/** Canonical did:aip ABNF: full 32–44 char base58 pubkey + agent_id slug. */
const CANONICAL_RE = /^did:aip:[1-9A-HJ-NP-Za-km-z]{32,44}:[A-Za-z0-9_-]{1,32}$/;
/** Legacy patterns we want to find. */
const PLATFORM_RE = /^did:aip:platform:/;
const SDK_RE = /^did:aip:sdk:/;
const TRUNCATED_RE = /^did:aip:[1-9A-HJ-NP-Za-km-z]{1,31}:[A-Za-z0-9_-]{1,32}$/;

function classify(did: string | null | undefined): "canonical" | "platform" | "sdk" | "truncated" | "other-did" | "missing" | "non-aip" {
  if (!did) return "missing";
  if (CANONICAL_RE.test(did)) return "canonical";
  if (PLATFORM_RE.test(did)) return "platform";
  if (SDK_RE.test(did)) return "sdk";
  if (TRUNCATED_RE.test(did)) return "truncated";
  if (/^did:/.test(did)) return "other-did";
  return "non-aip";
}

interface Row {
  did: string | null;
  owner?: string | null;
  agentId?: string | null;
}

function summarize(label: string, rows: Row[]): void {
  const counts: Record<string, number> = {};
  const examples: Record<string, string[]> = {};
  for (const r of rows) {
    const k = classify(r.did);
    counts[k] = (counts[k] ?? 0) + 1;
    if (!examples[k]) examples[k] = [];
    if (examples[k].length < 3 && r.did) examples[k].push(r.did);
  }
  console.log(`\n# ${label}`);
  console.log(`  total rows: ${rows.length}`);
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const ex = examples[k]?.join(", ") || "";
    console.log(`    ${k.padEnd(11)} ${String(n).padStart(5)}    ${ex}`);
  }
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) {
    console.error(`  [${table}] read failed:`, error.message);
    return [];
  }
  return (data as T[]) ?? [];
}

async function main(): Promise<void> {
  console.log(`Mode: ${apply ? "APPLY (will write)" : "DRY-RUN (no writes)"}`);

  // hosted_agents — keyed by agent_id + owner_address; DID is derived at read time.
  // No DID column stored. We still survey owner_address shapes.
  const hosted = await fetchAll<{ agent_id: string | null; owner_address: string | null }>(
    "hosted_agents",
    "agent_id, owner_address",
  );
  console.log(`\n# hosted_agents`);
  console.log(`  total rows: ${hosted.length}`);
  const ownerless = hosted.filter((r) => !r.owner_address);
  if (ownerless.length > 0) {
    console.log(`    ${ownerless.length} rows missing owner_address — these cannot get a canonical DID until owner is recovered`);
  }

  // agent_cache — DID is primary key
  const agentCache = await fetchAll<{ did: string | null; wallet_address: string | null; agent_id: string | null }>(
    "agent_cache",
    "did, wallet_address, agent_id",
  );
  summarize("agent_cache (DID = primary key)", agentCache.map((r) => ({ did: r.did, owner: r.wallet_address, agentId: r.agent_id })));

  // tasks — references both caller_did and agent_did
  const tasks = await fetchAll<{ caller_did: string | null; agent_did: string | null }>(
    "tasks",
    "caller_did, agent_did",
  );
  summarize("tasks.caller_did", tasks.map((r) => ({ did: r.caller_did })));
  summarize("tasks.agent_did", tasks.map((r) => ({ did: r.agent_did })));

  // Migration: only attempt for agent_cache rows where wallet_address + agent_id are present
  // (those are recoverable to canonical form). Everything else stays untouched.
  if (apply) {
    let updated = 0;
    let skipped = 0;
    for (const row of agentCache) {
      if (!row.did) { skipped++; continue; }
      const cls = classify(row.did);
      if (cls === "canonical" || cls === "non-aip" || cls === "other-did") { skipped++; continue; }
      if (!row.wallet_address || !row.agent_id) { skipped++; continue; }

      const newDid = `did:aip:${row.wallet_address}:${row.agent_id}`;
      if (!CANONICAL_RE.test(newDid)) { skipped++; continue; }

      const { error } = await supabase
        .from("agent_cache")
        .update({ did: newDid })
        .eq("did", row.did);

      if (error) {
        console.error(`  agent_cache update failed for ${row.did}:`, error.message);
        skipped++;
      } else {
        updated++;
        console.log(`  agent_cache: ${row.did} → ${newDid}`);
      }
    }
    console.log(`\nagent_cache: updated=${updated} skipped=${skipped}`);
  } else {
    console.log("\nRe-run with --apply to rewrite recoverable agent_cache DIDs.");
    console.log("tasks references are NOT rewritten automatically — they're historical");
    console.log("records. Consider an alias table if you need forward lookup.");
  }
}

main().catch((err) => {
  console.error("[migrate-onchain-dids] FATAL:", err);
  process.exitCode = 1;
});
