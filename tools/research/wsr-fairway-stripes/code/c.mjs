// client: node c.mjs -e "<js body>"  |  node c.mjs file.js  |  node c.mjs quit
import fs from "node:fs";
import http from "node:http";
const a = process.argv.slice(2);
let body;
if (a[0] === "quit") body = { op: "quit" };
else if (a[0] === "-e") body = { op: "eval", code: a.slice(1).join(" ") };
else body = { op: "eval", code: fs.readFileSync(a[0], "utf8") };
const req = http.request({ host: "127.0.0.1", port: Number(process.env.CPORT || 8791), method: "POST", path: "/" }, (res) => {
  let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => { console.log(t); process.exit(res.statusCode === 200 ? 0 : 1); });
});
req.on("error", (e) => { console.error(e.message); process.exit(2); });
req.end(JSON.stringify(body));
