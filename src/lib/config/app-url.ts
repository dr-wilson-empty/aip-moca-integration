/**
 * Returns the app's base URL.
 *
 * Reads `NEXT_PUBLIC_APP_URL`. In development we fall back to
 * `http://localhost:3000` because that's where `next dev` lives.
 *
 * In production we refuse to fall back to localhost — silently writing
 * `localhost:3000` into a hosted-agent endpoint causes that URL to be
 * baked into the on-chain registry PDA, which is permanent and can only
 * be fixed by deregistering + re-registering. We'd rather fail the
 * request loudly than corrupt on-chain state.
 *
 * Production check uses both `NODE_ENV` (set by Next.js to "production"
 * on `next build` output) and `process.env.RAILWAY_ENVIRONMENT` /
 * `VERCEL` so the guard kicks in on all common hosting paths even if
 * one signal is missing.
 */
const isProductionRuntime = (): boolean => {
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.RAILWAY_ENVIRONMENT) return true;
  if (process.env.VERCEL) return true;
  return false;
};

export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url;
  if (isProductionRuntime()) {
    throw new Error(
      "[app-url] NEXT_PUBLIC_APP_URL is not set in production. " +
        "Refusing to fall back to localhost:3000 — that value would be baked into " +
        "agent endpoint URLs (and permanently committed to Solana for on-chain registrations). " +
        "Set NEXT_PUBLIC_APP_URL=https://app.aipagents.xyz (or your deployed URL) in your hosting provider's env panel.",
    );
  }
  return "http://localhost:3000";
}
