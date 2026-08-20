// Print the SHA-256 hex for a new site password.
//   node tools/hash-password.mjs <newPassword>
// Paste the output into PASS_HASH in src/main.jsx and redeploy.
const pw = process.argv[2];
if (!pw) { console.error("usage: node tools/hash-password.mjs <newPassword>"); process.exit(1); }
const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
console.log([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
