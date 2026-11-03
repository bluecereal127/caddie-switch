// M_Fairway on all 21 holes, course and map: layers with SRT, TEV registers, stage formulas (compact), light channel, the line texture's hash.
import fs from "node:fs";
import crypto from "node:crypto";
import { readBrres, readMdl0, archiveTextures } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const seen = {};
const key = (o) => JSON.stringify(o);
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  for (const kind of ["course", "map"]) {
    const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
    const e = readBrres(buf).folders["3DModels(NW4R)"][0];
    const m = readMdl0(buf, e.off);
    const mat = m.materials.find((x) => x.name === "M_Fairway");
    const tex = archiveTextures(buf);
    const sig = {
      layers: mat.layers.map((l, k) => `${l.texture}${tex[l.texture] ? ":" + crypto.createHash("sha1").update(tex[l.texture].data).digest("hex").slice(0, 6) : ""} s${mat.srt[k].scale.map((v) => +v.toFixed(3))} r${mat.srt[k].rot} t${mat.srt[k].trans.map((v) => +v.toFixed(2))}`),
      tev: mat.tev, konst: mat.konst,
      stages: mat.shader.stages.map((s) => `m${s.texMap}c${s.texCoord}:${s.color.d}+lerp(${s.color.a},${s.color.b};${s.color.c})x${s.color.scale}${s.color.c === "konst" || s.color.b === "konst" || s.color.a === "konst" ? " k=" + s.kc : ""}`),
    };
    const k = kind + " " + key(sig);
    (seen[k] ??= []).push(hole);
  }
}
for (const [k, v] of Object.entries(seen)) console.log(`holes ${v.join(",")}\n  ${k}\n`);
