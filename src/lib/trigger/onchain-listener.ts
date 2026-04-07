/**
 * On-chain Event Listener for Solana.
 *
 * Monitors USDC token account balances for watched addresses.
 * When a balance increase is detected, triggers the associated automation.
 *
 * Uses polling (every scheduler cycle) instead of WebSocket for stability on devnet.
 */
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { getConnection } from "@/lib/solana/connection";
import { dbGetAutomation, dbUpdateAutomation, type DbAutomation } from "@/lib/supabase/automations";
import { logger } from "@/lib/logger";

/* ------------------------------------------------------------------ */
/*  Balance tracking (in-memory)                                       */
/* ------------------------------------------------------------------ */

const g = globalThis as typeof globalThis & {
  __aip_balance_cache?: Map<string, number>;
};
if (!g.__aip_balance_cache) g.__aip_balance_cache = new Map();
const balanceCache = g.__aip_balance_cache;

function getUsdcMint(): PublicKey | null {
  const mint = process.env.USDC_MINT_DEVNET;
  if (!mint) return null;
  return new PublicKey(mint);
}

/* ------------------------------------------------------------------ */
/*  Check for balance changes                                          */
/* ------------------------------------------------------------------ */

/**
 * Check if a watched address received USDC since last check.
 * Returns the amount received (delta) or 0 if no change/decrease.
 */
export async function checkBalanceChange(watchAddress: string): Promise<{
  changed: boolean;
  delta: number;
  currentBalance: number;
}> {
  const mint = getUsdcMint();
  if (!mint) return { changed: false, delta: 0, currentBalance: 0 };

  try {
    const connection = getConnection();
    const pubkey = new PublicKey(watchAddress);
    const ata = await getAssociatedTokenAddress(mint, pubkey);

    let currentBalance = 0;
    try {
      const account = await getAccount(connection, ata);
      currentBalance = Number(account.amount) / 1e6;
    } catch {
      // No token account = 0 balance
    }

    const cacheKey = watchAddress;
    const previousBalance = balanceCache.get(cacheKey);

    // First check — initialize cache, no trigger
    if (previousBalance === undefined) {
      balanceCache.set(cacheKey, currentBalance);
      return { changed: false, delta: 0, currentBalance };
    }

    const delta = currentBalance - previousBalance;
    balanceCache.set(cacheKey, currentBalance);

    if (delta > 0.001) { // Minimum 0.001 USDC to avoid dust triggers
      return { changed: true, delta, currentBalance };
    }

    return { changed: false, delta: 0, currentBalance };
  } catch (err) {
    logger.error("onchain", "balance_check_failed", {
      watchAddress,
      error: err instanceof Error ? err.message : String(err),
    });
    return { changed: false, delta: 0, currentBalance: 0 };
  }
}

/* ------------------------------------------------------------------ */
/*  Process onchain automations                                        */
/* ------------------------------------------------------------------ */

/**
 * Check all onchain automations and trigger if balance changed.
 * Called by the scheduler every cycle.
 */
export async function processOnchainAutomations(
  automations: DbAutomation[],
  executeAutomation: (auto: DbAutomation, triggerSource: string, contextData?: string) => Promise<void>
): Promise<void> {
  const onchainAutos = automations.filter(
    (a) => a.trigger_type === "onchain" && a.enabled && a.watch_address
  );

  for (const auto of onchainAutos) {
    try {
      // Rate limit: minimum 60 seconds between triggers
      if (auto.last_trigger_at) {
        const elapsed = Date.now() - new Date(auto.last_trigger_at).getTime();
        if (elapsed < 60_000) continue;
      }

      const result = await checkBalanceChange(auto.watch_address!);

      if (result.changed) {
        logger.info("onchain", "balance_change_detected", {
          automationId: auto.id,
          watchAddress: auto.watch_address,
          delta: result.delta.toFixed(6),
          currentBalance: result.currentBalance.toFixed(6),
        });

        // Update trigger timestamp
        await dbUpdateAutomation(auto.id, {
          last_trigger_at: new Date().toISOString(),
        });

        // Execute automation with context about the balance change
        const contextData = `On-chain event: ${result.delta.toFixed(2)} USDC received at ${auto.watch_address}. New balance: ${result.currentBalance.toFixed(2)} USDC.`;
        await executeAutomation(auto, "onchain", contextData);
      }
    } catch (err) {
      logger.error("onchain", "automation_error", {
        automationId: auto.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
