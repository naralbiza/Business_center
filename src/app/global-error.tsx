"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#050914", color: "#eef1f8", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h2 style={{ fontSize: 24, margin: 0 }}>Algo correu mal</h2>
          <p style={{ color: "#8794ad", fontSize: 14 }}>Tente novamente dentro de instantes.</p>
          <button onClick={() => retry()} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 12, border: 0, background: "#d6b06a", color: "#1a1305", fontWeight: 600, cursor: "pointer" }}>
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
