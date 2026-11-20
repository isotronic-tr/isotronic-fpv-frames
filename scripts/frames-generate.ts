/**
 * Açık kaynak frame DXF'lerinden 2D parça konturlarını üretir (build öncesi, elle çalıştırılır).
 *
 * Girdi : assets/frames/<model>/*.dxf  (değiştirilmeden saklanan kaynak dosyalar)
 * Çıktı : src/components/frame3d/generated/<model>.ts  — ELLE DÜZENLEMEYİN.
 *
 * Çalıştırma: npm run frames:generate   (ayrıntılı döküm için: npm run frames:generate -- --dump)
 * İdempotent: aynı girdiyle her çalıştırmada bayt bayt aynı çıktı.
 *
 * Ayrıştırıcı kendi yazımımız (bağımlılık yok): LINE, ARC, CIRCLE, LWPOLYLINE (bulge + kapalı bayrağı),
 * POLYLINE/VERTEX, ELLIPSE, SPLINE (kontrol noktası poligonu, uyarıyla). INSERT/BLOCK bulunursa uyarı basılır.
 * Açıklama türleri (TEXT, MTEXT, DIMENSION, LEADER, VIEWPORT, HATCH...) bilerek atlanır ve sayıları raporlanır.
 */
import fs from 'node:fs';
import path from 'node:path';

type P = [number, number];
interface Ent { type: string; layer: string; codes: [number, string][] }

const ROOT = path.resolve(import.meta.dirname, '..');
const DUMP = process.argv.includes('--dump');
const warnings: string[] = [];
const warn = (m: string) => { if (!warnings.includes(m)) warnings.push(m); };

/* ---------------- DXF okuma ---------------- */

function readDxf(file: string) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  // birim
  let insunits = 0;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS') { insunits = parseInt(pairs[i + 1][1], 10); break; }
  }
  // bölümler
  const ents: Ent[] = [];
  let section = '';
  let blocksHaveGeometry = false;
  let cur: Ent | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') { section = pairs[i + 1][1]; i++; cur = null; continue; }
    if (c === 0 && v === 'ENDSEC') { if (cur && section === 'ENTITIES') ents.push(cur); section = ''; cur = null; continue; }
    if (section === 'BLOCKS' && c === 0 && ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'SPLINE'].includes(v)) blocksHaveGeometry = true;
    if (section !== 'ENTITIES') continue;
    if (c === 0) { if (cur) ents.push(cur); cur = { type: v, layer: '', codes: [] }; continue; }
    if (!cur) continue;
    if (c === 8) cur.layer = v;
    cur.codes.push([c, v]);
  }
  return { insunits, ents, blocksHaveGeometry };
}

const num = (e: Ent, code: number, idx = 0) => {
  const all = e.codes.filter(([c]) => c === code);
  return all[idx] ? parseFloat(all[idx][1]) : 0;
};

/** Yay → noktalar (kiriş hatası ≤ 0.03 mm ya da en fazla 6°). */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): P[] {
  let sweep = a1 - a0;
  if (sweep <= 0) sweep += Math.PI * 2;
  // kiriş hatası ≤ 0.03 mm, en fazla 6°: küçük deliklerde az, büyük yaylarda yeterli segment
  const maxStep = Math.min((6 * Math.PI) / 180, 2 * Math.acos(Math.max(-1, 1 - 0.03 / Math.max(r, 1e-6))));
  const n = Math.max(2, Math.ceil(sweep / maxStep));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Bulge'lı iki nokta arası (bulge = tan(θ/4)). */
function bulgePts(p: P, q: P, b: number): P[] {
  if (Math.abs(b) < 1e-9) return [p, q];
  const theta = 4 * Math.atan(b);
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const r = d / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) ** 2));
  const ux = (q[0] - p[0]) / d, uy = (q[1] - p[1]) / d;
  const sgn = (b > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx - uy * h * sgn, cy = my + ux * h * sgn;
  const a0 = Math.atan2(p[1] - cy, p[0] - cx);
  const a1 = Math.atan2(q[1] - cy, q[0] - cx);
  if (b > 0) return arcPts(cx, cy, r, a0, a1);
  return arcPts(cx, cy, r, a1, a0).reverse();
}

/**
 * Gerçek (rasyonel) B-spline değerlendirmesi (de Boor). Yalnız `exactSplines` açıkken kullanılır: onaylı modellerin
 * çıktısı bayt bayt aynı kalsın diye onlarda eski kontrol poligonu yaklaşımı değişmez.
 */
let exactSplines = false;
function splinePts(e: Ent): P[] {
  const deg = num(e, 71);
  const K = e.codes.filter(([c]) => c === 40).map(([, v]) => parseFloat(v));
  const W = e.codes.filter(([c]) => c === 41).map(([, v]) => parseFloat(v));
  const C: P[] = [];
  for (const [c, v] of e.codes) {
    if (c === 10) C.push([parseFloat(v), 0]);
    else if (c === 20 && C.length) C[C.length - 1][1] = parseFloat(v);
  }
  const a = K[deg], b = K[C.length], n = C.length * 12, out: P[] = [];
  for (let s = 0; s <= n; s++) {
    const t = s === n ? b - 1e-9 * (b - a) : a + ((b - a) * s) / n;
    let k = deg;
    while (k < C.length - 1 && t >= K[k + 1]) k++;
    const d = Array.from({ length: deg + 1 }, (_, j) => {
      const i = k - deg + j, h = W.length === C.length ? W[i] : 1;
      return [C[i][0] * h, C[i][1] * h, h];
    });
    for (let r = 1; r <= deg; r++) {
      for (let j = deg; j >= r; j--) {
        const i = k - deg + j, al = (t - K[i]) / (K[i + deg - r + 1] - K[i]);
        d[j] = d[j].map((v, m) => (1 - al) * d[j - 1][m] + al * v);
      }
    }
    out.push([d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]]);
  }
  return out;
}

const SKIP = new Set(['TEXT', 'MTEXT', 'DIMENSION', 'LEADER', 'VIEWPORT', 'HATCH', 'POINT', 'ATTDEF', 'ATTRIB', 'MLEADER', 'SOLID', 'WIPEOUT', 'IMAGE', 'SEQEND', 'VERTEX']);

/** Varlık → polyline listesi (her biri ayrı açık/kapalı çizgi). */
function toPolylines(ents: Ent[], skipped: Map<string, number>) {
  const out: { layer: string; pts: P[] }[] = [];
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    switch (e.type) {
      case 'LINE':
        out.push({ layer: e.layer, pts: [[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)]] });
        break;
      case 'CIRCLE': {
        const pts = arcPts(num(e, 10), num(e, 20), num(e, 40), 0, Math.PI * 2);
        out.push({ layer: e.layer, pts });
        break;
      }
      case 'ARC':
        out.push({ layer: e.layer, pts: arcPts(num(e, 10), num(e, 20), num(e, 40), (num(e, 50) * Math.PI) / 180, (num(e, 51) * Math.PI) / 180) });
        break;
      case 'LWPOLYLINE': {
        const closed = (num(e, 70) & 1) === 1;
        const vs: { p: P; b: number }[] = [];
        for (const [c, v] of e.codes) {
          if (c === 10) vs.push({ p: [parseFloat(v), 0], b: 0 });
          else if (c === 20 && vs.length) vs[vs.length - 1].p[1] = parseFloat(v);
          else if (c === 42 && vs.length) vs[vs.length - 1].b = parseFloat(v);
        }
        const pts: P[] = [];
        const n = closed ? vs.length : vs.length - 1;
        for (let k = 0; k < n; k++) {
          const seg = bulgePts(vs[k].p, vs[(k + 1) % vs.length].p, vs[k].b);
          pts.push(...(pts.length ? seg.slice(1) : seg));
        }
        if (pts.length >= 2) out.push({ layer: e.layer, pts });
        break;
      }
      case 'POLYLINE': {
        const closed = (num(e, 70) & 1) === 1;
        const vs: { p: P; b: number }[] = [];
        let j = i + 1;
        for (; j < ents.length && ents[j].type === 'VERTEX'; j++) vs.push({ p: [num(ents[j], 10), num(ents[j], 20)], b: num(ents[j], 42) });
        i = j; // SEQEND
        const pts: P[] = [];
        const n = closed ? vs.length : vs.length - 1;
        for (let k = 0; k < n; k++) {
          const seg = bulgePts(vs[k].p, vs[(k + 1) % vs.length].p, vs[k].b);
          pts.push(...(pts.length ? seg.slice(1) : seg));
        }
        if (pts.length >= 2) out.push({ layer: e.layer, pts });
        break;
      }
      case 'ELLIPSE': {
        // merkez (10,20), büyük eksen ucu (11,21) merkeze göre, oran (40), parametre aralığı (41,42)
        const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21), ratio = num(e, 40);
        const t0 = num(e, 41);
        let t1 = num(e, 42);
        if (t1 <= t0) t1 += Math.PI * 2;
        const ma = Math.hypot(mx, my), rot = Math.atan2(my, mx), mi = ma * ratio;
        const n = Math.max(8, Math.ceil((t1 - t0) / ((6 * Math.PI) / 180)));
        const pts: P[] = [];
        for (let k = 0; k <= n; k++) {
          const t = t0 + ((t1 - t0) * k) / n;
          const x = ma * Math.cos(t), y = mi * Math.sin(t);
          pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
        }
        out.push({ layer: e.layer, pts });
        break;
      }
      case 'SPLINE': {
        if (exactSplines) { out.push({ layer: e.layer, pts: splinePts(e) }); break; }
        const pts: P[] = [];
        for (const [c, v] of e.codes) {
          if (c === 10) pts.push([parseFloat(v), 0]);
          else if (c === 20 && pts.length) pts[pts.length - 1][1] = parseFloat(v);
        }
        warn('SPLINE kontrol noktası poligonu olarak yaklaşıklandı');
        if (pts.length >= 2) out.push({ layer: e.layer, pts });
        break;
      }
      case 'INSERT':
        warn(`INSERT (blok referansı) desteklenmiyor, atlandı (katman ${e.layer})`);
        skipped.set('INSERT', (skipped.get('INSERT') ?? 0) + 1);
        break;
      default:
        if (!SKIP.has(e.type)) warn(`Bilinmeyen varlık türü atlandı: ${e.type}`);
        skipped.set(e.type, (skipped.get(e.type) ?? 0) + 1);
    }
  }
  return out;
}

/* ---------------- zincirleme ---------------- */

const TOL = 0.05;
const key = (p: P) => `${Math.round(p[0] / TOL)},${Math.round(p[1] / TOL)}`;

function area(pts: P[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Polylines → kapalı konturlar (uç noktaları TOL içinde çakışanlar birleşir; yinelenen segmentler atılır). */
function chainLoops(polys: P[][]) {
  type Seg = { a: string; b: string; pa: P; pb: P };
  const segs: Seg[] = [];
  const seen = new Set<string>();
  for (const pl of polys) {
    for (let i = 0; i + 1 < pl.length; i++) {
      const a = key(pl[i]), b = key(pl[i + 1]);
      if (a === b) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(k)) continue;
      seen.add(k);
      segs.push({ a, b, pa: pl[i], pb: pl[i + 1] });
    }
  }
  const adj = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [s.a, s.b]) { const l = adj.get(k); if (l) l.push(i); else adj.set(k, [i]); }
  });
  const used = new Uint8Array(segs.length);
  const loops: P[][] = [];
  let open = 0;
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const keys = [segs[i].a, segs[i].b];
    const pts: P[] = [segs[i].pa, segs[i].pb];
    for (let pass = 0; pass < 2; pass++) {
      for (;;) {
        const last = keys[keys.length - 1];
        const nx = (adj.get(last) ?? []).find((j) => !used[j]);
        if (nx === undefined) break;
        used[nx] = 1;
        const s = segs[nx];
        if (s.a === last) { keys.push(s.b); pts.push(s.pb); } else { keys.push(s.a); pts.push(s.pa); }
      }
      keys.reverse(); pts.reverse();
    }
    if (keys[0] === keys[keys.length - 1] && pts.length > 3) { pts.pop(); loops.push(pts); } else open++;
  }
  return { loops, open };
}

function bbox(pts: P[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function inside(pt: P, poly: P[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Douglas–Peucker (kapalı kontur; 0.02 mm) — tessellated eğrilerden gereksiz noktaları atar. */
function simplify(pts: P[], tol = 0.02): P[] {
  if (pts.length < 8) return pts;
  const dp = (a: number, b: number, keep: Uint8Array) => {
    const stack: [number, number][] = [[a, b]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      const [ax, ay] = pts[s], [bx, by] = pts[e % pts.length];
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9;
      let best = -1, bi = -1;
      for (let i = s + 1; i < e; i++) {
        const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / l;
        if (d > best) { best = d; bi = i; }
      }
      if (best > tol) { keep[bi] = 1; stack.push([s, bi], [bi, e]); }
    }
  };
  const keep = new Uint8Array(pts.length);
  // en uzak iki noktadan böl
  let far = 0, fd = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  keep[0] = keep[far] = 1;
  dp(0, far, keep);
  dp(far, pts.length, keep);
  return pts.filter((_, i) => keep[i]);
}


/* ---------------- DXF parça çıkarımı ---------------- */

interface Part { outer: P[]; holes: P[][]; bb: ReturnType<typeof bbox> }

/** Tek parçalık DXF: en büyük kapalı kontur dış hat, içindekiler delik. */
function dxfPart(file: string, skippedAll: Map<string, number>): Part {
  const { insunits, ents, blocksHaveGeometry } = readDxf(file);
  const scale = insunits === 4 ? 1 : insunits === 1 ? 25.4 : insunits === 5 ? 10 : insunits === 6 ? 1000 : 1;
  const base = path.basename(file);
  if (insunits !== 4) warn(`${base}: $INSUNITS=${insunits}, mm'ye ${scale} ile çevrildi`);
  if (blocksHaveGeometry) warn(`${base}: BLOCKS bölümünde geometri var; INSERT olmadığı için kullanılmadı`);
  const skipped = new Map<string, number>();
  const polys = toPolylines(ents, skipped).map((p) => p.pts.map(([x, y]) => [x * scale, y * scale] as P));
  for (const [k, v] of skipped) skippedAll.set(k, (skippedAll.get(k) ?? 0) + v);
  const { loops, open } = chainLoops(polys);
  if (open) warn(`${base}: ${open} açık zincir kaldı (kontur dışı bırakıldı)`);
  const sorted = loops.map((l) => ({ l, a: Math.abs(area(l)) })).sort((a, b) => b.a - a.a);
  const outer = sorted[0].l;
  const holes = sorted.slice(1).filter((h) => inside(h.l[0], outer)).map((h) => h.l);
  return { outer, holes, bb: bbox(outer) };
}

/** Yuvarlak delikler: merkez + yarıçap (sınır kutusu kare ve alan daireye uygun). */
function roundHoles(holes: P[][]) {
  const out: { c: P; r: number }[] = [];
  for (const h of holes) {
    const b = bbox(h);
    if (Math.abs(b.w - b.h) > 0.05 * Math.max(b.w, b.h)) continue;
    const r = (b.w + b.h) / 4;
    if (Math.abs(Math.abs(area(h)) - Math.PI * r * r) > 0.08 * Math.PI * r * r) continue;
    out.push({ c: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], r });
  }
  return out;
}

/* ---------------- STEP okuma (yalnızca gereken kadar) ---------------- */

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

interface StepSolid { name: string; verts: V3[]; circles: { c: V3; n: V3; r: number }[] }

/**
 * ISO-10303-21 dosyasından MANIFOLD_SOLID_BREP katılarını okur: ad, köşe noktaları (VERTEX_POINT),
 * daireler (CIRCLE: merkez, eksen, yarıçap). Montaj ağacı yoksa katılar dünya koordinatındadır.
 */
const stepCache = new Map<string, ReturnType<typeof readStepUncached>>();
function readStep(file: string) {
  let r = stepCache.get(file);
  if (!r) { r = readStepUncached(file); stepCache.set(file, r); }
  return r;
}

function readStepUncached(file: string): { solids: StepSolid[]; mm: boolean; assembly: boolean } {
  const txt = fs.readFileSync(file, 'latin1');
  const data = txt.slice(txt.indexOf('DATA;'));
  const ents = new Map<number, [string, string]>();
  const re = /#(\d+)\s*=\s*([A-Z0-9_]*)\s*\(([\s\S]*?)\)\s*;/g;
  for (let m; (m = re.exec(data)); ) ents.set(+m[1], [m[2], m[3]]);
  const refs = (s: string) => [...s.matchAll(/#(\d+)/g)].map((x) => +x[1]);
  const nums = (s: string) => [...s.matchAll(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)].map((x) => +x[0]);
  const vec = (id: number): V3 => { const n = nums(ents.get(id)![1].split(',').slice(1).join(',')); return [n[0], n[1], n[2]]; };
  const mm = [...ents.values()].some(([t, a]) => t === '' && /LENGTH_UNIT/.test(a) && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(a));
  const assembly = [...ents.values()].some(([t]) => t === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE');
  const solids: StepSolid[] = [];
  for (const [id, [t, a]] of [...ents.entries()].sort((x, y) => x[0] - y[0])) {
    if (t !== 'MANIFOLD_SOLID_BREP') continue;
    // ad + #id: bazı dışa aktarımlarda bütün katılar aynı adı taşır (ör. 'Imported1')
    const name = `${/'([^']*)'/.exec(a)?.[1] ?? ''}#${id}`;
    const seen = new Set<number>();
    const st = [id];
    while (st.length) {
      const i = st.pop()!;
      if (seen.has(i) || !ents.has(i)) continue;
      seen.add(i);
      st.push(...refs(ents.get(i)![1]));
    }
    const verts: V3[] = [];
    const circles: StepSolid['circles'] = [];
    for (const i of [...seen].sort((x, y) => x - y)) {
      const [ti, ai] = ents.get(i)!;
      if (ti === 'VERTEX_POINT') verts.push(vec(refs(ai)[0]));
      else if (ti === 'CIRCLE') {
        const [ax] = refs(ai);
        const r = nums(ai.split(',').slice(2).join(','))[0];
        const [loc, dir] = refs(ents.get(ax)![1]);
        circles.push({ c: vec(loc), n: norm3(vec(dir)), r });
      }
    }
    solids.push({ name, verts, circles });
  }
  return { solids, mm, assembly };
}

/* ---------------- kayıt: DXF parçası → STEP katısı ---------------- */

type M4 = number[];

/** Plaka düzlemi: deliklerin eksen yönü (en çok tekrarlanan), kalınlık köşe noktalarından. */
function plateFrame(s: StepSolid) {
  const cnt = new Map<string, { n: V3; k: number }>();
  for (const c of s.circles) {
    const n = c.n[0] + c.n[1] + c.n[2] < 0 ? ([-c.n[0], -c.n[1], -c.n[2]] as V3) : c.n;
    const k = n.map((v) => v.toFixed(3)).join(',');
    const e = cnt.get(k);
    if (e) e.k++; else cnt.set(k, { n, k: 1 });
  }
  const n = [...cnt.values()].sort((a, b) => b.k - a.k)[0].n;
  const a: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm3(cross(a, n)), e2 = cross(n, e1);
  let w0 = Infinity, w1 = -Infinity;
  for (const v of s.verts) { const w = dot(v, n); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
  // delik merkezleri (aynı deliğin üst/alt daireleri birleşir)
  const holes: { c: P; r: number }[] = [];
  for (const c of s.circles) {
    if (Math.abs(Math.abs(dot(c.n, n)) - 1) > 1e-3) continue;
    const p: P = [dot(c.c, e1), dot(c.c, e2)];
    if (!holes.some((h) => Math.hypot(h.c[0] - p[0], h.c[1] - p[1]) < 0.05 && Math.abs(h.r - c.r) < 0.05)) holes.push({ c: p, r: c.r });
  }
  const proj = s.verts.map((v) => [dot(v, e1), dot(v, e2)] as P);
  return { n, e1, e2, w0, w1, holes, proj };
}

/**
 * 2D kayıt: dönüş (0.25°) × ayna × çapa eşleşmesi. Çapa = DXF'teki en büyük yuvarlak delik; aynı yarıçaplı
 * (±0.05 mm) her STEP deliği bir öteleme adayıdır. Hata: yuvarlak delik merkezleri + dış kontur örnekleri.
 */
function register2d(part: Part, f: ReturnType<typeof plateFrame>) {
  const dh = roundHoles(part.holes);
  const RT = 0.05;
  const targets = f.holes.filter((t) => dh.some((h) => Math.abs(h.r - t.r) < RT));
  const anchor = [...dh].sort((a, b) => b.r - a.r)[0];
  const anchors = anchor ? targets.filter((t) => Math.abs(t.r - anchor.r) < RT) : [];
  const samples = part.outer.filter((_, i) => i % Math.max(1, Math.floor(part.outer.length / 60)) === 0);
  let best = { err: Infinity, a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0, mirror: false };
  for (const mirror of [false, true]) {
    for (let k = 0; k < 1440; k++) {
      const r = (k * Math.PI) / 720, co = Math.cos(r), si = Math.sin(r), fl = mirror ? -1 : 1;
      const a = co * fl, b = si * fl, c = -si, d = co;
      for (const an of anchors) {
        const tx = an.c[0] - (a * anchor.c[0] + c * anchor.c[1]), ty = an.c[1] - (b * anchor.c[0] + d * anchor.c[1]);
        let err = 0;
        for (const h of dh) {
          const x = a * h.c[0] + c * h.c[1] + tx, y = b * h.c[0] + d * h.c[1] + ty;
          let md = 5;
          for (const t of targets) if (Math.abs(t.r - h.r) < RT) md = Math.min(md, Math.hypot(x - t.c[0], y - t.c[1]));
          err += md;
        }
        for (const p of samples) {
          const x = a * p[0] + c * p[1] + tx, y = b * p[0] + d * p[1] + ty;
          let md = 5;
          for (const q of f.proj) md = Math.min(md, Math.hypot(x - q[0], y - q[1]));
          err += md * 0.2;
        }
        if (err < best.err - 1e-9) best = { err, a, b, c, d, tx, ty, mirror };
      }
    }
  }
  if (!anchors.length) throw new Error('Kayıt için yuvarlak delik eşleşmesi yok');
  return { ...best, matched: dh.length, targets: targets.length };
}

/** Yerel (u, v, w) → STEP dünya: P = e1·x' + e2·y' + n·(w0 + w); ayna varsa w ters (det +1). */
function localToWorld(rg: ReturnType<typeof register2d>, f: ReturnType<typeof plateFrame>): M4 {
  const { a, b, c, d, tx, ty, mirror } = rg;
  const { e1, e2, n, w0, w1 } = f;
  const col = (k: number) => [e1[k] * a + e2[k] * b, e1[k] * c + e2[k] * d];
  const rows: M4 = [];
  for (let k = 0; k < 3; k++) {
    const [cu, cv] = col(k);
    const t = e1[k] * tx + e2[k] * ty + n[k] * (mirror ? w1 : w0);
    rows.push(cu, cv, mirror ? -n[k] : n[k], t);
  }
  rows.push(0, 0, 0, 1);
  return rows;
}

const mul = (A: M4, B: M4): M4 => {
  const o: M4 = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += A[i * 4 + k] * B[k * 4 + j];
  return o;
};
const xf = (M: M4, p: V3): V3 => [0, 1, 2].map((i) => M[i * 4] * p[0] + M[i * 4 + 1] * p[1] + M[i * 4 + 2] * p[2] + M[i * 4 + 3]) as V3;

/**
 * STEP'te olmayan bir DXF parçasını (ör. 7" kol) başvuru parçasının (ör. 5" kol) STEP katısına oturtur.
 * Başvuru DXF'i katıya register2d ile kaydedilir; yeni parçanın rootR yarıçaplı 2 deliği başvurunun aynı
 * yarıçaplı 2 deliğine rijit (dönüş + öteleme, isteğe bağlı ayna) eşlenir. 4 aday (sıra × ayna) arasından,
 * kök bölgesindeki (kök deliklerine 25 mm'den yakın) dış kontur örneklerinin başvuru konturuna uzaklığı en küçük
 * olan seçilir. Kalınlık T; üst yüz başvuru katısının üst yüzünde.
 */
function deriveOnto(part: Part, ref: Part, f: ReturnType<typeof plateFrame>, rootR: number, T: number) {
  const refRg = register2d(ref, f);
  const pick = (p: Part) => roundHoles(p.holes).filter((h) => Math.abs(h.r - rootR) < 0.05).map((h) => h.c);
  const pr = pick(ref), pn = pick(part);
  if (pr.length !== 2 || pn.length !== 2) throw new Error(`türetme: ${rootR} mm yarıçaplı 2 kök deliği bekleniyordu (başvuru ${pr.length}, yeni ${pn.length})`);
  const big = (p: Part) => [...roundHoles(p.holes)].sort((a, b) => b.r - a.r)[0].c;
  const refMotor = big(ref);
  const refRoot: P = [(pr[0][0] + pr[1][0]) / 2, (pr[0][1] + pr[1][1]) / 2];
  const T2 = (g: { a: number; b: number; c: number; d: number; tx: number; ty: number }, p: P): P => [g.a * p[0] + g.c * p[1] + g.tx, g.b * p[0] + g.d * p[1] + g.ty];
  // başvuru kök delikleri ve kontur → plaka 2D
  const q = pr.map((p) => T2(refRg, p));
  const refOuter = ref.outer.map((p) => T2(refRg, p));
  const qm: P = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2];
  let best: { rg: ReturnType<typeof register2d>; score: number; rootErr: number } | null = null;
  const cands: string[] = [];
  for (const mirror of [false, true]) {
    for (const order of [0, 1]) {
      const p1 = pn[order], p2 = pn[1 - order];
      const fl = mirror ? -1 : 1;
      const r = Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) - Math.atan2(p2[1] - p1[1], fl * (p2[0] - p1[0]));
      const co = Math.cos(r), si = Math.sin(r);
      const g = { a: co * fl, b: si * fl, c: -si, d: co, tx: 0, ty: 0 };
      const m1 = T2(g, p1);
      g.tx = q[0][0] - m1[0]; g.ty = q[0][1] - m1[1];
      const m2 = T2(g, p2);
      const rootErr = Math.hypot(m2[0] - q[1][0], m2[1] - q[1][1]);
      const near = part.outer.map((p) => T2(g, p)).filter((p) => Math.hypot(p[0] - qm[0], p[1] - qm[1]) < 25);
      let score = 0;
      for (const p of near) {
        let md = 5;
        for (const o of refOuter) md = Math.min(md, Math.hypot(p[0] - o[0], p[1] - o[1]));
        score += md;
      }
      score /= Math.max(1, near.length);
      cands.push(score.toFixed(2));
      if (!best || score < best.score) best = { rg: { ...g, mirror, err: score, matched: 2, targets: 2 }, score, rootErr };
    }
  }
  const b = best!;
  // kalınlık T, üst yüz başvurunun üst yüzünde: aynasızda taban w1−T; aynada taban w1 (−n yönünde T)
  const f2 = { ...f, w0: f.w1 - T };
  return { rg: b.rg, f: f2, refRg, refMotor, refRoot, score: b.score, rootErr: b.rootErr, cands: cands.join('/') };
}

/* ---------------- model yapılandırması ---------------- */

/** Katı seçici: ada göre (RegExp) ya da geometriye göre (adlar anlamsızsa). */
type Sel = RegExp | ((s: StepSolid) => boolean);
const sel = (q: Sel, s: StepSolid) => (q instanceof RegExp ? q.test(s.name) : q(s));
/** Katının z aralığı (STEP Z yukarıysa). */
const zr = (s: StepSolid) => { let a = Infinity, b = -Infinity; for (const v of s.verts) { a = Math.min(a, v[2]); b = Math.max(b, v[2]); } return [Math.round(a * 100) / 100, Math.round(b * 100) / 100]; };
const zIs = (z0: number, z1: number) => (s: StepSolid) => { const [a, b] = zr(s); return Math.abs(a - z0) < 0.05 && Math.abs(b - z1) < 0.05; };
const xThin = (s: StepSolid) => { let a = Infinity, b = -Infinity; for (const v of s.verts) { a = Math.min(a, v[0]); b = Math.max(b, v[0]); } return b - a < 2.5; };

interface PartConfig {
  name: string;
  dxf: string;
  solid: Sel;
  expectT: number;
  /** Motor kolu mu (motor merkezleri bu parçaların kopyalarından bulunur). */
  arm?: boolean;
  /** STEP konumundan sonra frame z'sinde öteleme (mm, +yukarı). Kaynaktan sapma: KAYNAK.md'de yazılı olmalı. */
  lift?: number;
  /**
   * STEP'te bulunmayan parça: `solid` ile seçilen başvuru katılarına (ör. 5" kol) oturtulur. Başvuru DXF'i o katıya
   * kaydedilir; bu parçanın 2 yuvarlak kök deliği başvurunun 2 kök deliğine (aynı yarıçap) rijit olarak eşlenir.
   * Kalınlık expectT; üst yüz başvuru katısının üst yüzüyle aynı düzlemde. `front`: yalnızca burna bakan (true)
   * ya da arkaya bakan (false) başvuru kopyaları.
   */
  derive?: { refDxf: string; front: boolean; rootR: number };
}

interface ModelConfig {
  id: string;
  exportName: string;
  dir: string;
  step: string;
  /** STEP dünya eksenleri: yukarı ve burun yönü. */
  up: V3;
  forward: V3;
  parts: PartConfig[];
  standoff: Sel;
  /** Bilerek eklenmeyen katılar (rapor için). */
  ignore: Sel;
}

/** Source One v4: kolların üstündeki gövde (5" ve 7" ortak). */
const SO_BODY: PartConfig[] = [
  { name: 'ana plaka', dxf: 'SO_v4_bottom_plate_3mm.dxf', solid: zIs(6, 9), expectT: 3 },
  { name: 'kamera plakası', dxf: 'SO_v4_cam_plate_2mm_2x.dxf', solid: (s) => xThin(s) && zIs(6, 41)(s), expectT: 2 },
  { name: 'üst plaka', dxf: 'SO_v4_top_plate_2mm.dxf', solid: zIs(39, 41), expectT: 2 }
];
const SO_STANDOFF: Sel = (s) => s.verts.length === 8 && zIs(9, 39)(s);

const MODELS: ModelConfig[] = [
  {
    id: 'source-two',
    exportName: 'SOURCE_TWO',
    dir: 'assets/frames/source-two',
    step: 'Source Two v0.1.step',
    up: [0, 1, 0],
    // kamera montajları (cam_mount) −Z ucunda, anten yuvaları (aXII/foxeer) +Z ucunda → burun −Z
    forward: [0, 0, -1],
    parts: [
      { name: 'ana plaka', dxf: 'S2_v0.1_main_plate_3mm.dxf', solid: /^ST_v0\.1_main_plate_3mm/, expectT: 3 },
      { name: 'kol', dxf: 'S2_v0.1_5_inch_arms_4mm_4x.dxf', solid: /^ST_v0\.1_5_inch_arms_4mm/, expectT: 4, arm: true },
      { name: 'takviye plakası', dxf: 'S2_v0.1_reinforcement_plate_2mm_2x.dxf', solid: /^ST_v0\.1_reinforcement_plate_2mm/, expectT: 2 },
      { name: 'üst plaka', dxf: 'S2_v0.1_top_plate_2mm.dxf', solid: /^ST_v0\.1_top_plate_2mm/, expectT: 2 }
    ],
    standoff: /^standoff/,
    ignore: /^(M3|cam_mount|aXII|Session|foxeer|shark)/
  },
  {
    // TBS SOURCE ONE v4 (commit 9ae65b1). STEP montajı tek tip ad ('Imported1') taşır; katılar geometriyle seçilir.
    // Montaj yerleşimleri birim dönüşüm (doğrulandı) → katılar dünya koordinatında. Z yukarı.
    id: 'source-one',
    exportName: 'SOURCE_ONE',
    dir: 'assets/frames/source-one',
    step: 'SO_v4.STEP',
    up: [0, 0, 1],
    // kamera plakaları uzun plakaların düşük-Y ucunda → burun −Y (varsayım, KAYNAK.md)
    forward: [0, -1, 0],
    parts: [
      // SAPMA (KAYNAK.md): STEP'te kollarla arasında 2 mm boşluk var; plaka 2 mm yukarı alınıp kollara oturtuldu
      { name: 'kol altı plaka', dxf: 'SO_v4_center_plate_3mm.dxf', solid: zIs(-3, 0), expectT: 3, lift: 2 },
      { name: 'kol', dxf: 'SO_v4_5inch_arm_4mm_4x.dxf', solid: zIs(2, 6), expectT: 4, arm: true },
      ...SO_BODY
    ],
    standoff: SO_STANDOFF,
    ignore: () => false
  },
  {
    // TBS SOURCE ONE v4, 7" Long Range: aynı gövde + 6 mm 7" kollar (ön 2×, arka 2×). 7" kollar STEP'te yok:
    // 5" kol katılarına kök delikleriyle oturtulur (deriveOnto); 6 mm kol, 5" kolun üst yüzünden aşağı doğru
    // kalınlaşır ve STEP'teki 2 mm boşluğu doldurarak kol altı plakaya oturur (varsayım, KAYNAK.md).
    id: 'source-one-7',
    exportName: 'SOURCE_ONE_7',
    dir: 'assets/frames/source-one',
    step: 'SO_v4.STEP',
    up: [0, 0, 1],
    forward: [0, -1, 0],
    parts: [
      { name: 'kol altı plaka', dxf: 'SO_v4_center_plate_3mm.dxf', solid: zIs(-3, 0), expectT: 3 },
      // Deadcat: yana geniş açılan kollar (DXF adı 'back') kamera tarafında = önde. Dosya adları bu montajla
      // ters düşüyor; atama STEP'teki kamera plakası konumuna ve deadcat düzenine dayanır (KAYNAK.md).
      { name: 'kol (ön)', dxf: 'SO_v4_7inch_arm_6mm_back_2x.dxf', solid: zIs(2, 6), expectT: 6, arm: true, derive: { refDxf: 'SO_v4_5inch_arm_4mm_4x.dxf', front: true, rootR: 1.5 } },
      { name: 'kol (arka)', dxf: 'SO_v4_7inch_arm_6mm_front_2x.dxf', solid: zIs(2, 6), expectT: 6, arm: true, derive: { refDxf: 'SO_v4_5inch_arm_4mm_4x.dxf', front: false, rootR: 1.5 } },
      ...SO_BODY
    ],
    standoff: SO_STANDOFF,
    ignore: () => false
  }
];

/* ---------------- STEP'siz model: elle z seviyeleri ---------------- */

/** DXF → montaj yerleşimi: önce ayna (u → −u), sonra dönüş, sonra öteleme. Ayna varsa w ters çevrilir (det +1). */
interface Placement { mirror?: boolean; rotDeg: number; tx: number; ty: number }
interface ManualPart {
  name: string;
  dxf: string;
  t: number;
  /** Üst yüzün montaj z'si (mm). */
  zTop: number;
  place: Placement[];
  /** Motor merkezleri bu parçanın en büyük yuvarlak deliklerinden alınır. */
  motorHoles?: boolean;
}
interface ManualModel {
  manual: true;
  id: string;
  exportName: string;
  /** Ham DXF klasörü (repoya girmez). Yoksa model atlanır, üretilmiş dosya korunur. */
  dir: string;
  /** KAYNAK.md klasörü. */
  docs: string;
  /** Burun montajın −y ucundaysa frame'e geçerken 180° döndürülür. */
  noseNegY: boolean;
  parts: ManualPart[];
  standoffs: { at: P[]; d: number; zBottom: number; zTop: number }[];
}

const PW_GUARD_SIDE: P[] = [[81.73, 14.44], [81.73, -14.44], [81.73, 69], [81.73, -69]];
const PW_SHARED: P[] = [[8, 55], [-8, 55], [13, -69], [-13, -69]];

const MANUAL_MODELS: ManualModel[] = [
  {
    // PickleWhoop 30 (CC BY 4.0). Yerleşim ve z: kaynaktaki montaj STL'lerinden ölçüldü; ayrıntı KAYNAK.md.
    manual: true,
    id: 'picklewhoop-30',
    exportName: 'PICKLEWHOOP_30',
    dir: '../kaynak-modeller/picklewhoop30/DXF frame Files (for Carbon cutting)',
    docs: 'assets/frames/picklewhoop-30',
    noseNegY: true,
    parts: [
      { name: 'alt plaka', dxf: 'pw_bottom_plate_1mm_v2-0.dxf', t: 1, zTop: -23, place: [{ rotDeg: 0, tx: 0, ty: 0 }] },
      { name: 'alt koruma', dxf: 'pw30_guard_lower_3mm_v1-0.dxf', t: 3, zTop: -20, motorHoles: true, place: [{ mirror: true, rotDeg: 0, tx: 0, ty: -0.01 }] },
      {
        name: 'üst koruma', dxf: 'pw30_guard_upper_2mm_v1-0.dxf', t: 2, zTop: -12,
        place: [{ rotDeg: 0, tx: -0.008, ty: 0 }, { mirror: true, rotDeg: 0, tx: 0.008, ty: 0 }]
      },
      { name: 'ana gövde', dxf: 'pw30_frame_3mm_v1-1.dxf', t: 3, zTop: 3, place: [{ mirror: true, rotDeg: 315, tx: 1.538, ty: -0.637 }] }
    ],
    standoffs: [
      { at: PW_GUARD_SIDE.flatMap(([x, y]) => [[x, y], [-x, y]] as P[]), d: 4, zBottom: -20, zTop: -14 },
      { at: PW_SHARED, d: 4, zBottom: -20, zTop: -14 },
      { at: PW_SHARED, d: 4, zBottom: -12, zTop: 0 },
      { at: [[0, -46], [35, 0], [-35, 0], [0, 28], [0, -28]], d: 4, zBottom: -20, zTop: 0 }
    ]
  }
];

function buildManual(cfg: ManualModel) {
  const dir = path.join(ROOT, cfg.dir);
  const skipped = new Map<string, number>();
  exactSplines = true;
  const parts = cfg.parts.map((pc) => {
    const part = dxfPart(path.join(dir, pc.dxf), skipped);
    const inst = pc.place.map(({ mirror, rotDeg, tx, ty }): M4 => {
      const r = (rotDeg * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r), fl = mirror ? -1 : 1;
      return [co * fl, -si, 0, tx, si * fl, co, 0, ty, 0, 0, fl, mirror ? pc.zTop : pc.zTop - pc.t, 0, 0, 0, 1];
    });
    return { name: pc.name, part, inst, T: pc.t, regs: [] as string[], arm: false, motorHoles: !!pc.motorHoles };
  });
  exactSplines = false;
  const mp = parts.find((p) => p.motorHoles);
  if (!mp) throw new Error(`${cfg.id}: motorHoles parçası yok`);
  const rh = roundHoles(mp.part.holes), rmax = Math.max(...rh.map((h) => h.r));
  const raw = rh.filter((h) => h.r > rmax - 0.05).map((h) => xf(mp.inst[0], [h.c[0], h.c[1], 0]));
  if (raw.length !== 4) throw new Error(`${cfg.id}: 4 motor merkezi bekleniyordu, ${raw.length} bulundu`);
  const cx = raw.reduce((s, p) => s + p[0], 0) / 4, cy = raw.reduce((s, p) => s + p[1], 0) / 4;
  const zmin = Math.min(...cfg.parts.map((p) => p.zTop - p.t));
  const q = cfg.noseNegY ? -1 : 1;
  const C: M4 = [q, 0, 0, -q * cx, 0, q, 0, -q * cy, 0, 0, 1, -zmin, 0, 0, 0, 1];
  const standoffs = cfg.standoffs.flatMap((g) => g.at.map(([x, y]) => ({ at: [q * (x - cx), q * (y - cy)] as P, d: g.d, z: g.zBottom - zmin, h: g.zTop - g.zBottom })));
  return { parts, C, motors: raw.map((p) => [q * (p[0] - cx), q * (p[1] - cy)] as P), standoffs, ignored: [] as string[], skipped, step: null };
}

/* ---------------- çıktı ---------------- */

const r2 = (v: number) => Math.round(v * 100) / 100 + 0;
const r5 = (v: number) => Math.round(v * 1e5) / 1e5 + 0;
const ccw = (p: P[]) => (area(p) < 0 ? [...p].reverse() : p);
const cw = (p: P[]) => (area(p) > 0 ? [...p].reverse() : p);

function buildModel(cfg: ModelConfig) {
  const dir = path.join(ROOT, cfg.dir);
  const step = readStep(path.join(dir, cfg.step));
  if (!step.mm) warn(`${cfg.step}: uzunluk birimi mm değil ya da bulunamadı`);
  if (step.assembly) warn(`${cfg.step}: montaj ağacı var; yerleşim dönüşümleri okunmadı (katılar dünya koordinatında varsayıldı)`);

  // STEP dünya → frame (x sağ, y ileri, z yukarı)
  const up = norm3(cfg.up), fw = norm3(cfg.forward), right = cross(fw, up);
  const R: M4 = [...right, 0, ...fw, 0, ...up, 0, 0, 0, 0, 1];

  const skipped = new Map<string, number>();
  const used = new Set<string>();
  const parts: { name: string; part: Part; inst: M4[]; T: number; regs: string[]; arm: boolean }[] = [];
  const refParts = new Map<string, Part>();
  for (const pc of cfg.parts) {
    const part = dxfPart(path.join(dir, pc.dxf), skipped);
    const solids = step.solids.filter((s) => sel(pc.solid, s));
    if (!solids.length) throw new Error(`${pc.name}: STEP'te ${pc.solid} bulunamadı`);
    const inst: M4[] = [];
    const regs: string[] = [];
    let T = 0;
    const lift: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, pc.lift ?? 0, 0, 0, 0, 1];
    if (pc.derive) {
      const ref = refParts.get(pc.derive.refDxf) ?? dxfPart(path.join(dir, pc.derive.refDxf), skipped);
      refParts.set(pc.derive.refDxf, ref);
      for (const s of solids) {
        used.add(s.name);
        const f = plateFrame(s);
        const d = deriveOnto(part, ref, f, pc.derive.rootR, pc.expectT);
        // burna mı bakıyor: başvuru kolunun motor deliği kök deliklerinden ileride (frame +y) ise ön kol
        const M5 = mul(R, localToWorld(d.refRg, f));
        const refMotor = xf(M5, [d.refMotor[0], d.refMotor[1], 0]), refRoot = xf(M5, [d.refRoot[0], d.refRoot[1], 0]);
        if ((refMotor[1] > refRoot[1]) !== pc.derive.front) continue;
        T = pc.expectT;
        regs.push(`${s.name}: türetildi (kök delik hatası ${d.rootErr.toFixed(3)} mm, kök kontur skoru ${d.score.toFixed(2)}${d.rg.mirror ? ', ayna' : ''}; adaylar ${d.cands})`);
        inst.push(mul(lift, mul(R, localToWorld(d.rg, d.f))));
      }
      if (!inst.length) throw new Error(`${pc.name}: türetme için başvuru katısı kalmadı`);
      parts.push({ name: pc.name, part, inst, T, regs, arm: !!pc.arm });
      continue;
    }
    for (const s of solids) {
      used.add(s.name);
      const f = plateFrame(s);
      T = f.w1 - f.w0;
      if (Math.abs(T - pc.expectT) > 0.05) warn(`${pc.name} (${s.name}): STEP kalınlığı ${T.toFixed(2)} mm, dosya adı ${pc.expectT} mm`);
      const rg = register2d(part, f);
      regs.push(`${s.name}: hata ${rg.err.toFixed(2)} (${rg.matched} delik / ${rg.targets} hedef${rg.mirror ? ', ayna' : ''})`);
      if (process.argv.includes('--holes')) {
        regs.push(`   DXF yuvarlak: ${roundHoles(part.holes).map((h) => `r${h.r.toFixed(2)}@${h.c.map((v) => v.toFixed(1))}`).join(' ')}`);
        regs.push(`   DXF tüm delik bb: ${part.holes.map((h) => { const b = bbox(h); return `${b.w.toFixed(1)}x${b.h.toFixed(1)}`; }).join(' ')}`);
        regs.push(`   STEP: ${f.holes.map((h) => `r${h.r.toFixed(2)}@${h.c.map((v) => v.toFixed(1))}`).join(' ')}`);
      }
      inst.push(mul(lift, mul(R, localToWorld(rg, f))));
    }
    parts.push({ name: pc.name, part, inst, T, regs, arm: !!pc.arm });
  }

  // standoff'lar: en büyük yarıçaplı daireler (dış çap), eksen boyunca köşe noktası aralığı
  const standoffs = step.solids.filter((s) => sel(cfg.standoff, s)).map((s) => {
    used.add(s.name);
    const rmax = Math.max(...s.circles.map((c) => c.r));
    const c = s.circles.find((q) => q.r === rmax)!;
    const p = xf(R, c.c);
    let z0 = Infinity, z1 = -Infinity;
    for (const v of s.verts) { const z = dot(v, up); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { at: [p[0], p[1]] as P, d: 2 * rmax, z0, z1 };
  });
  const ignored = step.solids.filter((s) => !used.has(s.name)).map((s) => s.name);
  const unexpected = step.solids.filter((s) => !used.has(s.name) && !sel(cfg.ignore, s)).map((s) => s.name);
  if (unexpected.length) warn(`STEP'te tanımsız katılar: ${unexpected.join(', ')}`);

  // motor merkezleri: kol kopyalarında merkezden en uzak, en büyük yuvarlak delik
  const motors: P[] = [];
  const arms = parts.filter((p) => p.arm);
  if (!arms.length) throw new Error(`${cfg.id}: arm: true parça yok`);
  const armInst = arms.flatMap((a) => a.inst.map((m) => ({ m, holes: roundHoles(a.part.holes) })));
  // merkez: bütün kol kopyalarının delik ortalaması (STEP dünya orijini gövde merkezinde olmayabilir)
  const allArm = armInst.flatMap(({ m, holes }) => holes.map((h) => xf(m, [h.c[0], h.c[1], 0])));
  const ax = allArm.reduce((s, p) => s + p[0], 0) / allArm.length, ay = allArm.reduce((s, p) => s + p[1], 0) / allArm.length;
  for (const { m, holes: armHoles } of armInst) {
    const pts = armHoles.map((h) => ({ p: xf(m, [h.c[0], h.c[1], 0]), r: h.r }));
    const far = Math.max(...pts.map((q) => Math.hypot(q.p[0] - ax, q.p[1] - ay)));
    const cand = pts.filter((q) => Math.hypot(q.p[0] - ax, q.p[1] - ay) > far - 15).sort((a, b) => b.r - a.r)[0];
    motors.push([cand.p[0], cand.p[1]]);
  }
  // orijin: motorların ortası (xy), z = en alt nokta
  const cx = motors.reduce((s, p) => s + p[0], 0) / motors.length, cy = motors.reduce((s, p) => s + p[1], 0) / motors.length;
  let zmin = Infinity;
  for (const p of parts) for (const m of p.inst) for (const [x, y] of p.part.outer) zmin = Math.min(zmin, xf(m, [x, y, 0])[2], xf(m, [x, y, p.T])[2]);
  const C: M4 = [1, 0, 0, -cx, 0, 1, 0, -cy, 0, 0, 1, -zmin, 0, 0, 0, 1];
  const so = standoffs.map((s) => ({ at: [s.at[0] - cx, s.at[1] - cy] as P, d: s.d, z: s.z0 - zmin, h: s.z1 - s.z0 }));

  return { parts, C, motors: motors.map(([x, y]) => [x - cx, y - cy] as P), standoffs: so, ignored, skipped, step };
}

function main() {
  for (const cfg of [...MODELS, ...MANUAL_MODELS]) {
    // Ham dosyalar repoda değil: yoksa mevcut üretilmiş dosya korunur
    if ('manual' in cfg && !fs.existsSync(path.join(ROOT, cfg.dir))) {
      warn(`${cfg.id}: ham DXF klasörü yok (${cfg.dir}); üretilmiş dosya olduğu gibi bırakıldı`);
      continue;
    }
    const res = 'manual' in cfg ? buildManual(cfg) : buildModel(cfg);
    const parts = res.parts.map((p) => {
      const o: P = [p.part.bb.x0, p.part.bb.y0];
      const f = (pts: P[]) => simplify(pts).map(([x, y]) => [r2(x - o[0]), r2(y - o[1])] as P);
      const T0: M4 = [1, 0, 0, o[0], 0, 1, 0, o[1], 0, 0, 1, 0, 0, 0, 0, 1];
      return {
        name: p.name, w: r2(p.part.bb.w), h: r2(p.part.bb.h), t: r2(p.T),
        outer: f(ccw(p.part.outer)), holes: p.part.holes.map((h) => f(cw(h))),
        instances: p.inst.map((m) => mul(res.C, mul(m, T0)).map(r5))
      };
    });
    const data = {
      motors: res.motors.map(([x, y]) => [r2(x), r2(y)]),
      standoffs: res.standoffs.map((s) => ({ at: [r2(s.at[0]), r2(s.at[1])], d: r2(s.d), z: r2(s.z), h: r2(s.h) })),
      parts
    };
    if (DUMP) {
      if (res.step) console.log(`[${cfg.id}] STEP mm=${res.step.mm} montaj ağacı=${res.step.assembly} katı=${res.step.solids.length}`);
      console.log('atlanan DXF türleri:', Object.fromEntries([...res.skipped.entries()].sort()));
      for (const p of res.parts) {
        console.log(`${p.name.padEnd(16)} ${p.part.bb.w.toFixed(2)}×${p.part.bb.h.toFixed(2)} t=${p.T.toFixed(2)} delik=${p.part.holes.length} yuvarlak=${roundHoles(p.part.holes).length} kopya=${p.inst.length}`);
        for (const r of p.regs) console.log(`    ${r}`);
      }
      console.log('motorlar:', JSON.stringify(data.motors));
      console.log('standoff:', JSON.stringify(data.standoffs));
      console.log('eklenmeyen katılar:', res.ignored.join(', '));
    }
    const header = `// ELLE DÜZENLEMEYİN — scripts/frames-generate.ts tarafından üretildi (npm run frames:generate).
// Kaynak: ${'manual' in cfg ? cfg.docs : cfg.dir}/KAYNAK.md (lisans, commit, dosyalar). Birim: mm.
// Frame koordinatı: x sağ, y ileri (burun), z yukarı; orijin motorların ortası, z=0 en alt nokta.
// Her parça kopyası, yerel (u, v, w=kalınlık) → frame (x, y, z) 4×4 matrisiyle (satır öncelikli) yerleşir.
`;
    const body = `export const ${cfg.exportName} = ${JSON.stringify(data)} as const;\n`;
    const target = path.join(ROOT, `src/components/frame3d/generated/${cfg.id}.ts`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, header + body);
    console.log(`yazıldı: ${path.relative(ROOT, target)} (${parts.length} şekil, ${(header + body).length} bayt)`);
  }
  for (const w of warnings) console.warn(`UYARI: ${w}`);
}

main();
