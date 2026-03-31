/**
 * Start all AIP agent services.
 * Each agent listens on its own port (4001, 4002, 4003).
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from project root .env.local
config({ path: resolve(__dirname, "../../../.env.local") });

import { ALL_AGENTS } from "./agents.js";

console.log("Starting AIP Agent Services...\n");

for (const agent of ALL_AGENTS) {
  agent.start();
}

console.log("\nAll agents started. Press Ctrl+C to stop.\n");
