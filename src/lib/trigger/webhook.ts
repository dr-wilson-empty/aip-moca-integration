/**
 * Webhook Trigger — HMAC verification and rate limiting.
 *
 * External systems (GitHub, Stripe, Zapier, custom) POST to
 * /api/trigger/[automationId] with an HMAC signature header.
 * This module verifies the signature and enforces rate limits.
 */
import crypto from "crypto";
import type { DbAutomation } from "@/lib/supabase/automations";

const RATE_LIMIT_MS = 60_000; // Minimum 1 minute between triggers

/**
 * Generate a random HMAC secret for a new webhook automation.
 */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

/**
 * Compute HMAC-SHA256 signature for a payload.
 */
export function computeHmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify webhook HMAC signature.
 * Supports multiple header formats:
 *   - X-Webhook-Signature: sha256=<hex>
 *   - X-Hub-Signature-256: sha256=<hex>  (GitHub)
 *   - X-Signature: <hex>
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): { valid: boolean; error?: string } {
  if (!signatureHeader) {
    return { valid: false, error: "Missing signature header (X-Webhook-Signature)" };
  }

  // Extract hex from "sha256=abc123" format
  const sig = signatureHeader.replace(/^sha256=/, "").trim();
  const expected = computeHmac(payload, secret);

  // Timing-safe comparison
  try {
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");

    if (sigBuf.length !== expBuf.length) {
      return { valid: false, error: "Invalid signature length" };
    }

    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, error: "Invalid signature" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Malformed signature" };
  }
}

/**
 * Check rate limit for a webhook trigger.
 * Returns true if the trigger is allowed, false if rate-limited.
 */
export function checkRateLimit(automation: DbAutomation): { allowed: boolean; retryAfterMs?: number } {
  if (!automation.last_trigger_at) return { allowed: true };

  const lastTrigger = new Date(automation.last_trigger_at).getTime();
  const now = Date.now();
  const elapsed = now - lastTrigger;

  if (elapsed < RATE_LIMIT_MS) {
    return { allowed: false, retryAfterMs: RATE_LIMIT_MS - elapsed };
  }

  return { allowed: true };
}

/**
 * Check if automation budget allows another run.
 */
export function checkBudget(automation: DbAutomation, estimatedCost: number): { allowed: boolean; error?: string } {
  if (automation.total_spent + estimatedCost > automation.budget_limit) {
    return {
      allowed: false,
      error: `Budget exceeded: ${automation.total_spent.toFixed(2)} / ${automation.budget_limit.toFixed(2)} USDC`,
    };
  }
  return { allowed: true };
}
