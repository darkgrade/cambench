// Reading by agents, on the dictionary: the queue of saved pages not yet read in their current form and the
// dictionary's version, a page's text, the guide (each spec's definition and value format), and submitting a
// reading. A reading is typed JSON per spec; it is accepted only when its quote is on the page, the quote
// states the value's own figures (as the page writes them: "3.69 million", "35,9 mm", "24.66 oz"), and the
// value normalises to the standard. Refusals say why, so the reader can correct them. Also: pages from other
// reputable sites, the gaps, disagreements for adjudication, the golden-set evaluation, and dropping specs.
import { readFileSync } from 'node:fs';
import { SPEC, SPECS, READABLE, VERSION, normalise, figures, same, text } from './dictionary.ts';
import { flatSpecs, cameraKey } from './specs.ts';
import { factsForCamera, evidenceOf, conflictKey, NEED } from './consensus.ts';
import * as P from './pipeline.ts';

P.db.exec(`CREATE TABLE IF NOT EXISTS readings (sha TEXT NOT NULL, spec TEXT NOT NULL, value TEXT NOT NULL, quote TEXT NOT NULL, note TEXT, version INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (sha, spec, version));
CREATE TABLE IF NOT EXISTS read_pages (sha TEXT NOT NULL, version INTEGER NOT NULL, camera TEXT NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL, n INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (sha, version));
CREATE TABLE IF NOT EXISTS verdicts (camera TEXT NOT NULL, spec TEXT NOT NULL, sha TEXT NOT NULL, verdict TEXT NOT NULL, note TEXT, key TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (camera, spec, sha));`);
const now = () => new Date().toISOString();
// Readings kept under the page's content alone are filed under content and camera (once).
if (!P.setting('rekeyed', false)) {
  P.db.exec('BEGIN');
  for (const row of P.db.prepare('SELECT DISTINCT sha, camera FROM read_pages').all() as any[]) {
    const k = P.rekey(row.sha, row.camera);
    for (const t of ['readings', 'read_pages']) P.db.prepare(`UPDATE OR IGNORE ${t} SET sha = ? WHERE sha = ?`).run(k, row.sha);
    P.db.prepare('UPDATE OR IGNORE verdicts SET sha = ? WHERE sha = ? AND camera = ?').run(k, row.sha, row.camera);
  }
  P.db.exec('COMMIT');
  P.setSetting('rekeyed', true);
}
// Specs dropped automatically by an earlier reading loop come back (Kevin removes specs, never the app).
if (!P.setting('restoredDropped', false)) { P.setSetting('dropped', []); P.setSetting('restoredDropped', true); }
const dropped = () => P.dropped();
const ACTIVE = () => READABLE.filter((s) => !dropped().has(s.id));

// Never a source: sites Kevin ruled out, rumour sites, and sellers whose listings paste prose, not specs.
export const BANNED = /(^|\.)(digicamdb|cameradecision|apotelyt|versus|dxomark|pxlmag|amazon|ebay|aliexpress|temu|walmart|etsy|reddit|facebook|youtube|quora|[a-z]*-?rumou?rs?)\./i;

export function guide() {
  return ACTIVE().map((s) => ({ spec: s.id, label: s.label, definition: s.definition, value: s.input }));
}
// The pages for the latest run's cameras that no reader has read in their current form (and dictionary).
// part/of: one reader's share of the queue (pages whose id leaves this remainder), so many read at once.
export function queue(limit = 5, camera?: string, busy: number[] = [], part = 0, of = 1) {
  const r = P.latestRun();
  if (!r) return { left: 0, pages: [] as any[] };
  const out: any[] = [];
  for (const c of P.cameras(r.id)) {
    if (camera && c.id !== camera) continue;
    for (const p of P.pagesOf(r.id, c.id)) {
      if (['ebay', 'mpb'].includes(p.source) || busy.includes(p.id) || p.id % of !== part) continue;
      if (P.db.prepare('SELECT 1 FROM read_pages WHERE sha = ? AND version = ?').get(P.readKey(p), VERSION)) continue;
      out.push({ page: p.id, camera: c.id, name: c.name, source: p.source, url: p.url, chars: p.chars });
    }
  }
  return { left: out.length, pages: out.slice(0, limit) };
}
const pageOf = (id: number) => { const p = P.db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as any; if (!p) throw new Error(`No saved page ${id}.`); return p; };
const textOf = (p: any) => { const md = P.readPage(p.file).markdown; return p.source === 'wex' ? flatSpecs(md) || md : md; };
export function pageText(id: number, offset = 0, limit = 30000) {
  const p = pageOf(id);
  const t = textOf(p).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\]\((?:https?:)?\/\/[^)]*\)/g, ']').replace(/\n{3,}/g, '\n\n');
  return { page: id, camera: p.camera, source: p.source, url: p.url, chars: t.length, offset, text: t.slice(offset, offset + limit), more: offset + limit < t.length };
}

// ---- The quote must be on the page, and state the value's own figures.
const flat = (t: string) => String(t).toLowerCase().replace(/!\[[^\]]*\]\([^)]*\)|\]\([^)]*\)|<br\s*\/?>|[*_`#>|[\]\\]/g, ' ').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
// A page's figures as numbers: thousands separators dropped, a decimal comma read as a point, "3.69 million"
// and "1,62 Mio." also as whole numbers.
function pageFigures(t: string) {
  const s = String(t).replace(/(\d)[\s\u00a0\u202f'](\d{3})(?!\d)/g, '$1$2').replace(/(\d)[\s\u00a0\u202f'](\d{3})(?!\d)/g, '$1$2').replace(/(\d)[,.](\d{3})(?!\d)/g, '$1$2').replace(/(\d)[,.](\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
  return [...s.matchAll(/(\d+(?:\.\d+)?)\s*(million|mio\.?|m\b|k\b)?/gi)].flatMap((m) => {
    const n = Number(m[1]);
    return [n, ...(m[2] ? [/^m/i.test(m[2]) ? Math.round(n * 1e6) : Math.round(n * 1e3)] : [])];
  });
}
export function states(spec: string, raw: any, quote: string) {
  const want = figures(spec, raw);
  if (!want.length) return true;
  const have = pageFigures(quote);
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)) || (b > 1000 && Math.abs(a - b) / b < 0.005);
  return want.every((n) => have.some((h) => near(h, n) || near(h * 1e6, n) || near(h * 1e3, n) || (/min/i.test(quote) && near(h * 60, n))));
}

export function submit(id: number, values: Array<{ spec: string; value: any; quote: string; note?: string }>) {
  const p = pageOf(id), sha = P.readKey(p), hay = flat(`${P.readPage(p.file).markdown}\n${textOf(p)}`);
  const accepted: string[] = [], refused: Array<{ spec: string; why: string }> = [], rows: any[] = [];
  for (const v of values || []) {
    const s = SPEC[v.spec];
    if (!s || v.spec === 'video_max' || dropped().has(v.spec)) { refused.push({ spec: v.spec, why: 'not a spec to read: use the ids from spec_guide' }); continue; }
    const parts = flat(v.quote || '').split(/\s*(?:\.\.\.|…)\s*/).filter((x) => x.length >= 2);
    if (!parts.length) { refused.push({ spec: v.spec, why: 'quote the words on the page that state this value' }); continue; }
    if (!parts.every((x) => hay.includes(x))) { refused.push({ spec: v.spec, why: 'the quote is not on the page: copy it exactly ("..." between separate parts)' }); continue; }
    const n = normalise(v.spec, v.value);
    if (!n.ok) { refused.push({ spec: v.spec, why: `${JSON.stringify(v.value)} is not a value: give ${n.why}` }); continue; }
    if (!states(v.spec, v.value, v.quote)) { refused.push({ spec: v.spec, why: `the quote does not state ${JSON.stringify(v.value)}: quote the words with these figures as the page writes them` }); continue; }
    rows.push([v.spec, n.value, String(v.quote).slice(0, 500), v.note ? String(v.note).slice(0, 300) : null]);
    accepted.push(v.spec);
  }
  P.db.exec('BEGIN');
  try {
    P.db.prepare('DELETE FROM readings WHERE sha = ? AND version = ?').run(sha, VERSION);
    for (const [spec, value, quote, note] of rows) P.db.prepare('INSERT OR REPLACE INTO readings (sha, spec, value, quote, note, version, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(sha, spec, JSON.stringify(value), quote, note, VERSION, now());
    P.db.prepare('INSERT OR REPLACE INTO read_pages (sha, version, camera, source, url, n, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(sha, VERSION, p.camera, p.source, p.url, rows.length, now());
    P.db.exec('COMMIT');
  } catch (e) {
    P.db.exec('ROLLBACK');
    throw e;
  }
  return { page: id, accepted: accepted.length, refused };
}

// A reader's brief for one page: small, so many run at once.
export function readerPrompt(p: { page: number; name: string; camera: string; source: string; url: string }) {
  return `Read one saved web page about the ${p.name} (${p.camera}) and record exactly what it says, for Cambench, a camera spec database.
Page ${p.page}: ${p.source}, ${p.url}.
1. Call spec_guide once: each spec's exact definition and the JSON its value takes.
2. Call read_page {"page": ${p.page}}; while it says more: true, call it again with offset increased by 30000.
3. Call submit_reads {"page": ${p.page}, "values": [{"spec", "value", "quote", "note"?}, ...]} with an entry for every spec the page states about the ${p.name} body itself:
- value: JSON exactly as spec_guide gives it, in the units the page uses (the app converts: {"n": 24.66, "unit": "oz"} is fine);
- follow each definition exactly: a figure for a different measure (automatic AF zones where the spec is selectable points, a video ISO for a stills ISO, viewfinder-on battery life) is not that spec's value; mention it in "note" or leave it out;
- quote: the exact words on the page that state the value, with its figures as the page writes them ("..." between separate parts);
- only this camera, never another model the page compares or mentions, nor lenses, accessories or kits;
- an absence (false, "None", "No") only where the page says so, never from silence.
4. Fix every refused entry (its reason says why) and submit again with all values. A page that says nothing about this camera: submit values [].
Reply with one line: the number of values accepted.`;
}

// A page from another reputable site for a camera (a retailer's sheet, a review's spec table, a maker's
// manual): read through Firecrawl (or a saved copy from the last month), checked to be this camera's page.
export async function addPage(camera: string, url: string) {
  const r = P.latestRun();
  if (!r) throw new Error('No run yet.');
  const c = P.cameras(r.id).find((x) => x.id === camera);
  if (!c) throw new Error(`No camera ${camera} in the corpus.`);
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (BANNED.test(`.${host}.`)) throw new Error(`${host} is not a source (ruled out, rumours, or listings rather than specs).`);
  const known = P.pagesOf(r.id, c.id).find((x: any) => x.url.split(/[?#]/)[0] === url.split(/[?#]/)[0]);
  if (known) return { page: known.id, source: known.source, saved: 'already' };
  const source = `site:${host}`;
  const hit = P.cached(r.id, url);
  const page = hit ? { markdown: hit.markdown, meta: {} as any } : await P.scrape(url, false, 3000);
  if (page.markdown.length < 300) throw new Error(`only ${page.markdown.length} characters read from ${url}`);
  // A camera's own page names it near its top; a list or roundup of many cameras (a UVC webcam list) names it
  // somewhere in its lines. Either way the reader records only what the page states for this camera.
  const head = `${page.meta?.title || ''} ${page.markdown.slice(0, 4000)}`;
  const named = P.names(head, c.id, c.brand, true) || P.names(decodeURIComponent(url).replace(/[-_/]+/g, ' '), c.id, c.brand, true) || page.markdown.split('\n').some((l) => l.length < 400 && P.names(l, c.id, c.brand, true));
  if (!named) throw new Error(`${url} does not name the ${c.name}.`);
  if (P.ACCESSORY.test(`${page.meta?.title || ''} ${decodeURIComponent(url)}`)) throw new Error(`${url} is an accessory's page.`);
  if (!hit) P.savePage(r.id, c.id, source, url, page.markdown, page.meta, url);
  const row = P.db.prepare('SELECT id FROM pages WHERE run_id = ? AND camera = ? AND url = ? ORDER BY id DESC LIMIT 1').get(r.id, c.id, hit ? hit.row.url : url) as any;
  return { page: row?.id, source, saved: hit ? 'reused' : 'fetched' };
}

// What is not green yet, per camera: each spec without three independent owners, its value and who has it.
export function gaps(camera?: string) {
  const r = P.latestRun();
  if (!r) return { total: 0, cameras: [] as any[] };
  const cams = P.cameras(r.id).filter((c) => !camera || c.id === camera).map((c) => {
    const f = factsForCamera(r.id, c);
    const open = ACTIVE().filter((s) => !s.quote).map((s) => ({ spec: s.id, label: s.label, status: f[s.id]?.status || 'missing', value: f[s.id]?.text ?? null, owners: f[s.id]?.owners || [], disagree: (f[s.id]?.conflicts || []).slice(0, 6).map((e) => `${e.owner}: ${text(s.id, e.value)} ("${String(e.raw).slice(0, 80)}")`) })).filter((x) => x.status !== 'verified');
    return { camera: c.id, name: c.name, green: ACTIVE().filter((s) => !s.quote).length - open.length, open };
  });
  return { total: cams.reduce((n, c) => n + c.open.length, 0), cameras: cams };
}

// Disagreements for an adjudicator: per camera and spec, the groups of values with each reading's quote.
export function conflicts(camera?: string) {
  const r = P.latestRun();
  if (!r) return { items: [] as any[] };
  const items: any[] = [];
  for (const c of P.cameras(r.id).filter((x) => !camera || x.id === camera)) {
    const { evidence } = evidenceOf(r.id, c);
    for (const s of SPECS.filter((x) => !x.quote && x.kind !== 'set' && x.kind !== 'modes')) {
      const ev = evidence.filter((e) => e.spec === s.id);
      const groups: any[][] = [];
      for (const e of ev) { const g = groups.find((x) => same(s.id, x[0].value, e.value)); if (g) g.push(e); else groups.push([e]); }
      if (groups.length < 2) continue;
      const key = conflictKey(ev);
      if (P.db.prepare('SELECT 1 FROM verdicts WHERE camera = ? AND spec = ? AND key = ? LIMIT 1').get(c.id, s.id, key)) continue;
      items.push({ camera: c.id, name: c.name, spec: s.id, definition: s.definition, key, groups: groups.map((g) => ({ value: text(s.id, g[0].value), readings: g.map((e) => ({ sha: e.sha, owner: e.owner, url: e.url, quote: e.raw })) })) });
    }
  }
  return { items };
}
// An adjudicator's verdicts on one disagreement: each reading is right, an error (a typo, a copied figure,
// another model's), or another measure (not what the definition counts). Kept by the readings it judged.
export function judge(camera: string, spec: string, key: string, verdicts: Array<{ sha: string; verdict: 'right' | 'error' | 'other'; note?: string }>) {
  for (const v of verdicts) P.db.prepare('INSERT OR REPLACE INTO verdicts (camera, spec, sha, verdict, note, key, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(camera, spec, v.sha, v.verdict, v.note ?? null, key, now());
  return { judged: verdicts.length };
}

// The golden set: every value of three cameras decided from the makers' sheets. A run is measured against it.
const GOLDEN = JSON.parse(readFileSync(new URL('./eval/golden.json', import.meta.url), 'utf8'));
const want = (s: (typeof SPECS)[number], g: any) => {
  if (g.values[s.id] !== undefined) { const n = normalise(s.id, g.values[s.id]); return n.ok ? n.value : undefined; }
  if (s.na && g.values[s.na.when] !== undefined) { const n = normalise(s.na.when, g.values[s.na.when]); if (n.ok && JSON.stringify(n.value) === JSON.stringify(s.na.is)) return 'n/a'; }
  return undefined;
};
const matches = (s: (typeof SPECS)[number], a: any, b: any) =>
  a === 'n/a' || b === 'n/a' ? a === b : s.kind === 'set' ? [...a].sort().join() === [...b].sort().join() : s.kind === 'modes' ? a.map((x: any) => `${x.w}x${x.h}`).sort().join() === b.map((x: any) => `${x.w}x${x.h}`).sort().join() : same(s.id, a, b);
export function evaluate() {
  const r = P.latestRun();
  if (!r) throw new Error('No run yet.');
  const misses: any[] = [];
  let right = 0, total = 0;
  for (const [id, g] of Object.entries<any>(GOLDEN.cameras)) {
    const c = P.cameras(r.id).find((x) => x.id === id);
    if (!c) continue;
    const f = factsForCamera(r.id, c);
    for (const s of ACTIVE().filter((x) => !x.quote)) {
      const w = want(s, g);
      if (w === undefined) continue;
      total++;
      const got = f[s.id];
      if (got && matches(s, w, got.value)) { right++; continue; }
      misses.push({ camera: id, spec: s.id, want: w === 'n/a' ? 'n/a' : text(s.id, w), got: got ? got.text : null, status: got?.status ?? 'missing', owners: got?.owners ?? [] });
    }
  }
  const cameras = P.cameras(r.id).map((c) => {
    const f = factsForCamera(r.id, c), ss = ACTIVE().filter((x) => !x.quote);
    return { camera: c.name, green: ss.filter((s) => f[s.id]?.status === 'verified').length, of: ss.length, disputed: ss.filter((s) => f[s.id]?.status === 'disputed').length };
  });
  return { accuracy: total ? Math.round((right / total) * 1000) / 10 : null, right, total, misses, cameras, need: NEED };
}

export const cameraIds = () => { const r = P.latestRun(); return r ? P.cameras(r.id).map((c) => ({ id: c.id, name: c.name, key: cameraKey(c.name) })) : []; };
