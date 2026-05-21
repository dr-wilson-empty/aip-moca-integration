/**
 * One-shot — dump the raw hosted_agents row for airdrop-hunter so we
 * can confirm whether the per-capability prices the user set in the UI
 * (0.10 / 0.15 / 0.20) actually landed in Supabase, or whether the
 * collapse happened earlier in the create flow.
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

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("hosted_agents")
    .select("agent_id, owner_address, name, capabilities_json, active")
    .eq("agent_id", "airdrop-hunter")
    .maybeSingle();
  if (error) { console.error(error); process.exit(1); }
  if (!data) { console.log("No row"); return; }
  console.log("agent_id:", data.agent_id);
  console.log("active:", data.active);
  console.log("owner:", data.owner_address);
  console.log("");
  console.log("capabilities_json (raw):");
  console.log(data.capabilities_json);
  console.log("");
  try {
    const parsed = JSON.parse(data.capabilities_json);
    console.log("Parsed pricing per capability:");
    for (const c of parsed) {
      console.log(`  ${c.id?.padEnd(28)} ${c.pricing?.amount} ${c.pricing?.token}`);
    }
  } catch (e) {
    console.error("  PARSE ERROR:", e);
  }
}
main();
