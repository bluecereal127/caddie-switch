import "./storage.js";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/* ---- password gate (kept out of App.jsx on purpose) ----
   Casual-deterrence only: the whole bundle is public JS, and each visitor's
   data is their own device's localStorage anyway — a stranger can never touch
   YOUR data. This just keeps drive-by visitors off the UI.
   To change the password: node tools/hash-password.mjs <newPassword>
   and paste the hash below. Changing it re-locks every device. */
const PASS_HASH = "3b519a894320dc8a7a7977b33fae371bd3c81866b4df3dd7293507a3525be716"; // "caddie"
const GATE_KEY = "caddie:gate";

const sha256Hex = async (text) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

function Gate() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem(GATE_KEY) === PASS_HASH; } catch { return false; }
  });
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if ((await sha256Hex(pw)) === PASS_HASH) {
      try { localStorage.setItem(GATE_KEY, PASS_HASH); } catch {}
      setUnlocked(true);
    } else { setErr(true); setPw(""); }
  };

  if (unlocked) return <App />;
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#1E5631", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#F7F9F4", borderRadius: 20, padding: "28px 32px",
        boxShadow: "0 8px 30px rgba(0,0,0,.35)", textAlign: "center", width: 280 }}>
        <div style={{ fontSize: 34 }}>⛳</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#14301D", margin: "6px 0 14px" }}>Caddie·Switch</div>
        <input type="password" value={pw} autoFocus placeholder="password"
          onChange={(e) => { setPw(e.target.value); setErr(false); }}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12,
            border: `2px solid ${err ? "#E5484D" : "#CFE0D2"}`, fontSize: 14, outline: "none" }} />
        {err && <div style={{ color: "#E5484D", fontSize: 12, marginTop: 6 }}>nope — try again</div>}
        <button type="submit" style={{ marginTop: 12, width: "100%", padding: "10px 0", borderRadius: 12,
          border: "none", background: "#2E7D46", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          Tee off
        </button>
      </form>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Gate />);
