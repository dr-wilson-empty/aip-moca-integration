import { COUNTERPART_AGENT_CARDS } from "@/lib/mock/agentCards";
import { registerCard, listCards } from "./agent-card-store";

const gs = globalThis as typeof globalThis & { __aip_seeded?: boolean };
let seeded = gs.__aip_seeded ?? false;

/**
 * Demo ajanlarini in-memory store'a kaydet.
 * Birden fazla cagrilsa bile sadece bir kez calisir.
 */
export function seedDemoAgents(): void {
  if (seeded) return;
  seeded = true;
  gs.__aip_seeded = true;

  for (const card of Object.values(COUNTERPART_AGENT_CARDS)) {
    registerCard(card);
  }

  console.log(`[Seed] ${listCards().length} demo agent registered`);
}
