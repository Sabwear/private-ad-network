"use client";

export default function GlobalError() {
  return <html lang="en"><body><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", background: "#f4f8f7", color: "#12343c" }}><section style={{ maxWidth: 520, padding: 32, border: "1px solid #d8e5e2", borderRadius: 16, background: "white", textAlign: "center" }}><h1>Loopline needs a refresh</h1><p>Something unexpected interrupted the application. Refresh the page to reconnect.</p><button type="button" onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "11px 16px", border: 0, borderRadius: 8, background: "#087b70", color: "white", fontWeight: 700 }}>Refresh application</button></section></main></body></html>;
}
