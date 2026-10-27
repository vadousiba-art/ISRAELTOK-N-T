"use client";

// Last-resort screen when the root layout itself fails (no CSS loaded).
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#080808", color: "#f5f5f5", fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#f20d2f" }}>夜</div>
          <h1 style={{ fontWeight: 600 }}>Something went wrong.</h1>
          <p style={{ color: "#999999" }}>YORU hit an unexpected error. Your account and posts are safe.</p>
          <button
            onClick={reset}
            style={{ marginTop: 12, background: "#f20d2f", color: "white", border: 0, borderRadius: 999, padding: "12px 24px", fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
