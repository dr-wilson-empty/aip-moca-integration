/**
 * Next.js Instrumentation Hook.
 * Runs once when the server starts.
 * Used to start the automation scheduler.
 */
export async function register() {
  // Only run on server, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
