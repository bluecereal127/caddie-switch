// Client for tools/harness/driver.mjs: node tools/harness/drive.mjs <op> [args...]
// Several ops in one call: separate them with "," (e.g. press A , wait 500 , shot).
// Plain http (no timeout): a traced shot can take minutes.
import http from "node:http";

const port = Number(process.env.HARNESS_DRIVER_PORT || 8765);
const argv = process.argv.slice(2);
const cmds = [];
let cur = [];
for (const a of argv) { if (a === ",") { if (cur.length) cmds.push(cur); cur = []; } else cur.push(a); }
if (cur.length) cmds.push(cur);

function post(body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/" }, (res) => {
      let t = "";
      res.on("data", (d) => (t += d));
      res.on("end", () => resolve({ ok: res.statusCode === 200, text: t }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

for (const [op, ...args] of cmds) {
  const r = await post(JSON.stringify({ op, args }));
  console.log(`${op} ${args.join(" ").slice(0, 200)}: ${r.text}`);
  if (!r.ok) process.exit(1);
}
