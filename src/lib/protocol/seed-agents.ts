import { COUNTERPART_AGENT_CARDS } from "@/lib/mock/agentCards";
import { registerCard, listCards } from "./agent-card-store";

let seeded = false;

/**
 * Demo ajanlarini in-memory store'a kaydet.
 * Birden fazla cagrilsa bile sadece bir kez calisir.
 */
export function seedDemoAgents(): void {
  if (seeded) return;
  seeded = true;

  for (const card of Object.values(COUNTERPART_AGENT_CARDS)) {
    registerCard(card);
  }

  console.log(`[Seed] ${listCards().length} demo agent registered`);
}
