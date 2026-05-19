/**
 * Soft-delete a hosted agent in Supabase (sets active=false). Marketplace
 * filters by active=true so the agent disappears from listings; the row
 * is preserved for historical audit. Owner is required as a guard so we
 * don't accidentally hit the wrong record.
 *
 * Usage:
 *   npx tsx scripts/deactivate-hosted-agent.ts <agent_id> <owner_address>
 */
import { readFileSync } from "node:fs";

try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* */ }

import { createClient } from "@supabase/supabase-js";

async function main() {
  const [agentId, owner] = process.argv.slice(2);
  if (!agentId || !owner) {
    console.error("Usage: npx tsx scripts/deactivate-hosted-agent.ts <agent_id> <owner_address>");
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: existing, error: fetchErr } = await supabase
    .from("hosted_agents")
    .select("agent_id, owner_address, name, active")
    .eq("agent_id", agentId)
    .single();
  if (fetchErr || !existing) {
    console.error(`hosted_agents row not found: ${fetchErr?.message}`);
    process.exit(1);
  }
  if (existing.owner_address !== owner) {
    console.error(`Owner mismatch — passed ${owner}, table has ${existing.owner_address}.`);
    process.exit(1);
  }

  const { error } = await supabase
    .from("hosted_agents")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .eq("owner_address", owner);

  if (error) {
    console.error("Update failed:", error.message);
    process.exit(1);
  }
  console.log(`Deactivated hosted_agents row "${agentId}" (${existing.name}).`);
}

main().catch((err) => {
  console.error("[deactivate-hosted-agent] FATAL:", err?.message ?? err);
  process.exitCode = 1;
});
