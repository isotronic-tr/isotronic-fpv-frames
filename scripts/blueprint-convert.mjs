/**
 * Blueprint 65 STP → src/components/frame3d/generated/blueprint-65.ts (elle ve tek seferlik çalıştırılır).
 * Build'in ve `frames:generate`'in parçası DEĞİLDİR; projeye bağımlılık eklemez.
 *
 * Kullanım:
 *   node scripts/blueprint-convert.mjs <occt-import-js klasörü> <kaynak .stp> [çıktı .ts]
 * <occt-import-js klasörü>: paketin kök klasörü (içinde dist/occt-import-js.js olan).
 * Adımlar ve sürüm: assets/frames/blueprint-65/KAYNAK.md
 *
 * Kenarlar yalnız CAD yüzleri arasındaki sınırlardan alınır. Aynı yüzün içindeki üçgen kenarları ve teğet geçişler
 * çizilmez; bu yüzden çizgilerde tesselasyon gürültüsü oluşmaz.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** Tesselasyon: en büyük kiriş sapması (mm) ve açısal sapma (radyan). */
export const LINEAR_DEFLECTION = 0.03;
export const ANGULAR_DEFLECTION = 0.3;
/** İki CAD yüzü arasındaki açı bundan büyükse kenar çizilir (derece). */
export const EDGE_ANGLE_DEG = 30;
/** Köşe birleştirme ızgarası (mm). */
const WELD = 0.005;
/** Duct silindirinin yarıçapı (mm): motor merkezleri bu silindirlerin eksenlerinden okunur. */
const DUCT_R = 16.65;

const [toolDir, stp, outArg] = process.argv.slice(2);
if (!toolDir || !stp) {
  console.error('Kullanım: node scripts/blueprint-convert.mjs <occt-import-js klasörü> <kaynak .stp> [çıktı .ts]');
  process.exit(1);
}
const out = outArg ?? path.resolve(import.meta.dirname, '../src/components/frame3d/generated/blueprint-65.ts');

const require = createRequire(import.meta.url);
const occt = await require(path.resolve(toolDir, 'dist/occt-import-js.js'))();
const source = fs.readFileSync(stp);
const res = occt.ReadStepFile(new Uint8Array(source), {
  linearUnit: 'millimeter',
  linearDeflectionType: 'absolute_value',
  linearDeflection: LINEAR_DEFLECTION,
  angularDeflection: ANGULAR_DEFLECTION
});
if (!res.success || res.meshes.length !== 1) throw new Error(`STP okunamadı (başarı ${res.success}, mesh ${res.meshes?.length})`);
const mesh = res.meshes[0];
const P = mesh.attributes.position.array, N = mesh.attributes.normal.array, I = mesh.index.array;

/** STEP (X sağ, Y yukarı, Z arka) → frame (x sağ, y burun, z yukarı). */
const toFrame = (x, y, z) => [x, -z, y];

/* ---------- motor merkezleri: STEP metninden duct silindirleri ---------- */
const text = source.toString('latin1').replace(/\r?\n/g, '');
const ent = new Map([...text.matchAll(/#(\d+)=([A-Z0-9_]+)\((.*?)\);/g)].map((m) => [m[1], [m[2], m[3]]]));
const centers = new Map();
for (const [t, a] of ent.values()) {
  if (t !== 'CYLINDRICAL_SURFACE') continue;
  const m = /^'[^']*',#(\d+),([-+.\dE]+)$/.exec(a);
  if (!m || Math.abs(parseFloat(m[2]) - DUCT_R) > 1e-3) continue;
  const loc = /#(\d+)/.exec(ent.get(m[1])[1])[1];
  const c = /\(([^)]*)\)/.exec(ent.get(loc)[1])[1].split(',').map(parseFloat);
  const f = toFrame(c[0], c[1], c[2]);
  centers.set(`${f[0].toFixed(2)},${f[1].toFixed(2)}`, [f[0], f[1]]);
}
const motors = [...centers.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
if (motors.length !== 4) throw new Error(`4 motor merkezi bekleniyordu, ${motors.length} bulundu`);
const cx = motors.reduce((s, m) => s + m[0], 0) / 4, cy = motors.reduce((s, m) => s + m[1], 0) / 4;

/* ---------- köşe birleştirme ---------- */
let zmin = Infinity;
for (let i = 0; i < P.length; i += 3) zmin = Math.min(zmin, P[i + 1]);
const r2 = (v) => Math.round(v * 100) / 100 + 0;
const ids = new Map(), pos = [], remap = new Int32Array(P.length / 3);
for (let i = 0; i < P.length / 3; i++) {
  const k = `${Math.round(P[i * 3] / WELD)},${Math.round(P[i * 3 + 1] / WELD)},${Math.round(P[i * 3 + 2] / WELD)}`;
  let id = ids.get(k);
  if (id === undefined) {
    id = pos.length / 3;
    ids.set(k, id);
    const f = toFrame(P[i * 3], P[i * 3 + 1] - zmin, P[i * 3 + 2]);
    pos.push(r2(f[0] - cx), r2(f[1] - cy), r2(f[2]));
  }
  remap[i] = id;
}

/* ---------- üçgenler ve CAD yüz sınırları ---------- */
const normal = (i) => [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
const faceOf = new Int32Array(I.length / 3).fill(-1);
mesh.brep_faces.forEach((f, n) => { for (let t = f.first; t <= f.last; t++) faceOf[t] = n; });
const tris = [], sides = new Map();
for (let t = 0; t < I.length / 3; t++) {
  const c = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], v = c.map((i) => remap[i]);
  if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
  tris.push(v[0], v[1], v[2]);
  for (let e = 0; e < 3; e++) {
    const a = e, b = (e + 1) % 3, lo = Math.min(v[a], v[b]), hi = Math.max(v[a], v[b]);
    const na = normal(c[a]), nb = normal(c[b]);
    const n = v[a] < v[b] ? [na, nb] : [nb, na];
    const key = `${lo}|${hi}`;
    const l = sides.get(key);
    if (l) l.push({ face: faceOf[t], n }); else sides.set(key, [{ face: faceOf[t], n }]);
  }
}
const limit = Math.cos((EDGE_ANGLE_DEG * Math.PI) / 180);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const edges = [];
for (const [key, l] of sides) {
  let sharp = l.length === 1;
  for (let i = 0; i < l.length && !sharp; i++) {
    for (let j = i + 1; j < l.length; j++) {
      if (l[i].face !== l[j].face && (dot(l[i].n[0], l[j].n[0]) < limit || dot(l[i].n[1], l[j].n[1]) < limit)) sharp = true;
    }
  }
  if (sharp) edges.push(key.split('|').map(Number));
}
edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const data = { motors: motors.map(([x, y]) => [r2(x - cx), r2(y - cy)]), positions: pos, indices: tris, edges: edges.flat() };
const header = `// ELLE DÜZENLEMEYİN — scripts/blueprint-convert.mjs tarafından üretildi.
// Kaynak: assets/frames/blueprint-65/KAYNAK.md (lisans, araç sürümü, parametreler). Birim: mm.
// Frame koordinatı: x sağ, y ileri (burun), z yukarı; orijin motorların ortası, z=0 en alt nokta.
// positions: x,y,z üçlüleri; indices: üçgenler; edges: çizilecek CAD kenarları (köşe indeksi çiftleri).
`;
const body = `export const BLUEPRINT_65: { motors: readonly (readonly number[])[]; positions: readonly number[]; indices: readonly number[]; edges: readonly number[] } = ${JSON.stringify(data)};\n`;
fs.writeFileSync(out, header + body);
console.log(`yazıldı: ${out} (${pos.length / 3} köşe, ${tris.length / 3} üçgen, ${edges.length} kenar, CAD yüzü ${mesh.brep_faces.length}, ${(header + body).length} bayt)`);
console.log('motorlar:', JSON.stringify(data.motors));
