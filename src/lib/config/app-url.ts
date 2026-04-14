/**
 * Returns the app's base URL.
 * Uses NEXT_PUBLIC_APP_URL env var if set, otherwise falls back to localhost.
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
