"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#04060d", color: "#f4f6fb", fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 72 }}>☢️</div>
          <h1 style={{ fontWeight: 900 }}>Total meltdown.</h1>
          <p style={{ color: "#8a92a7" }}>The whole app exploded. Even the Menace is concerned.</p>
          <button
            onClick={reset}
            style={{ marginTop: 12, background: "#1f6bff", color: "white", border: 0, borderRadius: 999, padding: "12px 24px", fontWeight: 800 }}
          >
            Rebuild civilization
          </button>
        </div>
      </body>
    </html>
  );
}
