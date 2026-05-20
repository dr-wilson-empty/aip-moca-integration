/**
 * Dump capabilities_json for every hosted agent and compare it to what
 * the live API currently returns, so we can confirm the fix's blast
 * radius before deploying.
 */
import { readFileSync } from "node:fs";
try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local */ }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function fetchLiveDetail(did: string) {
  const url = `https://app.aipagents.xyz/api/agent-card/detail?did=${encodeURIComponent(did)}`;
  const r = await fetch(url);
  return r.json();
}

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("hosted_agents")
    .select("agent_id, name, owner_address, capabilities_json, active")
    .eq("active", true);
  if (error) { console.error(error); process.exit(1); }
  if (!data) return;

  for (const row of data) {
    const supaCaps = JSON.parse(row.capabilities_json);
    const did = `did:aip:${row.owner_address}:${row.agent_id}`;
    let live;
    try { live = await fetchLiveDetail(did); } catch { live = null; }

    const supaMap = new Map<string, string>(supaCaps.map((c: { id: string; pricing: { amount: string } }) => [c.id, c.pricing.amount]));
    const liveMap = new Map<string, string>((live?.capabilities ?? []).map((c: { id: string; pricing: { amount: string } }) => [c.id, c.pricing?.amount]));

    const mismatches: string[] = [];
    for (const [id, supaAmt] of supaMap) {
      const liveAmt = liveMap.get(id);
      if (liveAmt !== supaAmt) {
        mismatches.push(`${id}: configured ${supaAmt} → currently charging ${liveAmt}`);
      }
    }

    const tag = mismatches.length > 0 ? "❌ MISMATCH" : "✓ OK";
    console.log(`${tag}  ${row.name} (${row.agent_id})`);
    for (const m of mismatches) console.log(`     ${m}`);
  }
}
main();
