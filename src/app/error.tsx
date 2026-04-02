"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-[1920px] mx-auto px-10 py-20 flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="w-16 h-16 border border-red-800/40 rounded-full flex items-center justify-center">
        <span className="font-display text-2xl text-red-400">!</span>
      </div>
      <div>
        <h2 className="font-display text-xl text-off-white uppercase tracking-wider mb-2">Something went wrong</h2>
        <p className="font-mono text-sm text-muted max-w-md">
          An unexpected error occurred. Please try again.
        </p>
      </div>
      <button
        onClick={reset}
        className="font-mono text-xs text-bg-base bg-mint px-6 py-3 rounded-lg hover:bg-accent transition-colors uppercase tracking-wider"
      >
        Try Again
      </button>
    </div>
  );
}
