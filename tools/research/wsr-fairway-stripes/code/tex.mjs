// Export a hole's fairway textures (course + map archives) as raw RGBA + JSON header, for a Python PNG writer.
import fs from "node:fs";
import { archiveTextures } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const [id, kind, re] = process.argv.slice(2);
const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
const t = archiveTextures(buf);
fs.mkdirSync("tex", { recursive: true });
for (const [name, x] of Object.entries(t)) {
  if (!new RegExp(re).test(name)) continue;
  fs.writeFileSync(`tex/${id}-${kind}-${name}.rgba`, x.data);
  fs.writeFileSync(`tex/${id}-${kind}-${name}.json`, JSON.stringify({ w: x.width, h: x.height, format: x.format }));
  // stats
  const d = x.data; let mn = [255, 255, 255, 255], mx = [0, 0, 0, 0], sm = [0, 0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 4; k++) { mn[k] = Math.min(mn[k], d[i + k]); mx[k] = Math.max(mx[k], d[i + k]); sm[k] += d[i + k]; }
  console.log(name, x.width + "x" + x.height, "fmt", x.format, "min", mn.join(","), "max", mx.join(","), "mean", sm.map((v) => (v / (d.length / 4)).toFixed(1)).join(","));
}
