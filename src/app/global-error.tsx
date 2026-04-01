"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ background: "#010001", color: "#E7FFEF", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Something went wrong</h2>
          <button onClick={reset} style={{ background: "#E7FFEF", color: "#010001", padding: "0.75rem 1.5rem", border: "none", cursor: "pointer", fontSize: "0.875rem" }}>
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
