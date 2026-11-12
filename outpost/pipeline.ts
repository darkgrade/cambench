// The fetch, as steps kept in SQLite, each with its own tasks and outputs, so a stop costs only what was
// not done:
//   discover   every page of B&H's digital camera listing, body only (one task a page), each listing kept
//   corpus     the newest camera bodies, by name identity (no network)
//   locate     each camera on each source, found by a Firecrawl search on that site
//   scrape     each page found, saved in full as Markdown with its URL and when it was scraped
//   consensus  what readers recorded from each page, merged into facts verified by independent sources
// A finished step keeps a hash of what it made and of what it was made from: when Retry or Resume
// changes an earlier step, the steps made from it run again, and only their changed tasks are redone.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { candidate, dataUrl, thumbUrl, MIN_PX } from './images.ts';
import { dirname, join } from 'node:path';
import { gateway } from 'outpost-gateway';
import { cameraKey, brandOf, displayName, BRANDS, flatSpecs, type Source } from './specs.ts';
import { SPECS as DICT } from './dictionary.ts';
import { factsForCamera, specLevels } from './consensus.ts';
import { levelOf } from './level.ts';
// How much of a page looks like a spec sheet (labelled rows): the scraper's test for a spec page.
const specRows = (md: string) => md.split('\n').filter((l) => /^\|[^|]{2,60}\|[^|]{1,}\|/.test(l.trim()) || /^[-*]?\s*[A-Z][\w /().&+-]{2,40}:\s+\S/.test(l.trim())).length;

const DB = process.env.CAMERA_ATLAS_DB || ':memory:';
export const db = new DatabaseSync(DB);
export const PAGES = process.env.CAMERA_ATLAS_PAGES || join(DB === ':memory:' ? '/tmp/camera-atlas' : dirname(DB), 'pages');
db.exec(`CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, fresh INTEGER NOT NULL, state TEXT NOT NULL, error TEXT, size INTEGER NOT NULL DEFAULT 10);
CREATE TABLE IF NOT EXISTS steps (run_id INTEGER NOT NULL, key TEXT NOT NULL, state TEXT NOT NULL, error TEXT, hash TEXT, inputs TEXT, data TEXT NOT NULL DEFAULT '{}', doing TEXT, started_at TEXT, updated_at TEXT, PRIMARY KEY (run_id, key));
CREATE TABLE IF NOT EXISTS tasks (run_id INTEGER NOT NULL, step TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, grp TEXT, sub TEXT, args TEXT NOT NULL, state TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, error TEXT, out TEXT, PRIMARY KEY (run_id, step, id));
CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL, camera TEXT NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL, title TEXT, file TEXT NOT NULL, chars INTEGER NOT NULL, scraped_at TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cameras (run_id INTEGER NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, brand TEXT NOT NULL, rank INTEGER NOT NULL, info TEXT NOT NULL, PRIMARY KEY (run_id, id));
CREATE TABLE IF NOT EXISTS facts (run_id INTEGER NOT NULL, camera TEXT NOT NULL, spec TEXT NOT NULL, fact TEXT NOT NULL, PRIMARY KEY (run_id, camera, spec));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pictures (camera TEXT NOT NULL, side TEXT NOT NULL, url TEXT NOT NULL, page TEXT, file TEXT NOT NULL, thumb TEXT NOT NULL, width INTEGER, height INTEGER, approved_at TEXT NOT NULL, why TEXT, PRIMARY KEY (camera, side));
CREATE TABLE IF NOT EXISTS candidates (id INTEGER PRIMARY KEY, camera TEXT NOT NULL, side TEXT NOT NULL, url TEXT NOT NULL, page TEXT, title TEXT, file TEXT, thumb TEXT, look TEXT, width INTEGER, height INTEGER, state TEXT NOT NULL, why TEXT, at TEXT NOT NULL, UNIQUE (camera, side, url));`);
// Pictures turned away only for being under the old 2,000 px rule can be found again.
db.exec("DELETE FROM candidates WHERE state = 'rejected' AND why LIKE 'file: %under 2000 px'");
try {
  db.exec('ALTER TABLE pages ADD COLUMN asked TEXT');
} catch {}
// What reading agents found on a page, keyed by the page's content: a page read once is never read again
// unless what it says changes.
db.exec(`CREATE TABLE IF NOT EXISTS agent_reads (sha TEXT NOT NULL, spec TEXT NOT NULL, value TEXT NOT NULL, quote TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (sha, spec));
CREATE TABLE IF NOT EXISTS agent_done (sha TEXT PRIMARY KEY, camera TEXT NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL, values_n INTEGER NOT NULL, at TEXT NOT NULL);`);
// A reading kept before a rule changed is held to it: location through a phone is no built-in GPS.
db.exec(`UPDATE agent_reads SET value = '"None"' WHERE spec = 'gps' AND value = '"Via smartphone"'`);
const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
const one = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
const J = (s: string | null | undefined, d: any = {}) => (s ? JSON.parse(s) : d);
const now = () => new Date().toISOString();
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const RETRY_MS = Number(process.env.CAMERA_ATLAS_RETRY_MS || 1500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const why = (e: any) => String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 400);
export const AUTH = /unauthori[sz]ed|\b401\b|\b403\b|forbidden|not connected|sign(ed)?[ -]?in again|token (has )?expired|invalid[_ ]grant/i;
const RATE = /rate.?limit|\b429\b|too many requests|quota|insufficient credits|payment required|\b402\b/i;
function tx(f: () => void) {
  db.exec('BEGIN');
  try { f(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export const setting = (k: string, d: any) => J(one('SELECT value FROM settings WHERE key = ?', k)?.value, d);
export const setSetting = (k: string, v: any) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, JSON.stringify(v));

// ---- The sources. Owner is who stands behind the data: two sites of one company count once.
// B&H and the makers' own sites are trusted; the rest are counted, never taken on their own word.
export interface Src extends Source { domains: (brand: string) => string[]; query: string; page?: RegExp; to?: (url: string) => string; prices?: boolean; direct?: (name: string) => string; rank?: (url: string, title: string) => number }
const VENDOR: Record<string, string[]> = { Canon: ['usa.canon.com', 'canon-europe.com', 'global.canon'], Nikon: ['imaging.nikon.com', 'nikonusa.com'], Sony: ['sony.com', 'electronics.sony.com', 'alphauniverse.com'],
  Panasonic: ['panasonic.com', 'shop.panasonic.com'], Leica: ['leica-camera.com'], Sigma: ['sigma-global.com', 'sigmaamerica.com', 'sigmaphoto.com'], Fujifilm: ['fujifilm-x.com'], Hasselblad: ['hasselblad.com'],
  'OM System': ['explore.omsystem.com'], Pentax: ['ricoh-imaging.co.jp', 'us.ricoh-imaging.com'] };
// Makers' newsrooms, for the announcement date and launch price their spec pages leave out.
const NEWSROOM: Record<string, string[]> = { Canon: ['usa.canon.com', 'global.canon', 'canon-europe.com'], Nikon: ['nikonusa.com', 'nikon.com', 'imaging.nikon.com'], Sony: ['sony.com', 'alphauniverse.com'],
  Panasonic: ['news.panasonic.com', 'panasonic.com'], Leica: ['leica-camera.com'], Sigma: ['sigma-global.com', 'sigmaamerica.com'], Fujifilm: ['fujifilm.com', 'fujifilm-x.com'] };
// Photography news sites, each its own owner, for the same two facts at launch.
export const NEWS = ['petapixel.com', 'digitalcameraworld.com', 'photographyblog.com', 'imaging-resource.com', 'thephoblographer.com', 'cined.com', 'newsshooter.com'];
// A maker's spec page before its shop or overview page.
const specFirst = (url: string, title: string) => (/spec|technical|tech-data|technische/i.test(url) ? 3 : 0) + (/spec/i.test(title) ? 1 : 0) - (/\/shop\/|\/store|\/buy|\/p\/|overview|accessor/i.test(url) ? 2 : 0);
export const SOURCES: Src[] = [
  { key: 'vendor', title: 'Manufacturer', owner: 'maker', trusted: true, domains: (b) => VENDOR[b] || [], query: 'specifications', rank: specFirst },
  { key: 'press', title: 'Press release', owner: 'maker', trusted: true, domains: (b) => NEWSROOM[b] || VENDOR[b] || [], query: 'announces press release price availability', rank: (u, t) => (/news|press|release/i.test(u) ? 2 : 0) + (/announc|introduc/i.test(t) ? 1 : 0) },
  { key: 'bh', title: 'B&H', owner: 'B&H', trusted: true, domains: () => ['bhphotovideo.com'], query: 'camera specs', page: /\/c\/product\/\d+-REG\//, to: (u) => u.replace(/(\.html).*$/, '$1/specs'), prices: true },
  // DPReview: its product page, or the review a search finds first for a new camera (followed to the
  // product page it links, whose spec sheet is read; a review's comparison tables never are).
  { key: 'dpreview', title: 'DPReview', owner: 'DPReview', trusted: false, domains: () => ['dpreview.com'], query: 'specifications', page: /dpreview\.com\/(products\/[^/]+\/[^/]+\/[^/?#]+|reviews\/[^?#]+)/, to: (u) => (/\/products\//.test(u) ? u.match(/^(.*\/products\/[^/]+\/[^/]+\/[^/?#]+)/)![1] + '/specifications' : u.split(/[?#]/)[0]), rank: (u) => (/\/products\//.test(u) ? 2 : /\/reviews\//.test(u) ? 1 : -10) },
  { key: 'adorama', title: 'Adorama', owner: 'Adorama', trusted: false, domains: () => ['adorama.com'], query: 'camera body only specs', page: /adorama\.com\/([^?#]+\/p\/[a-z0-9]+|[a-z0-9]+\.html)/i, to: (u) => u.split(/[?#]/)[0], rank: (u, t) => (/body/i.test(u + t) ? 2 : 0) - (/\bw\/|with|lens|kit|\d{2}-\d{2,3}\s?mm/i.test(u + t) ? 4 : 0) },
  // Two more retailers with full, structured spec sheets, each its own owner.
  { key: 'crutchfield', title: 'Crutchfield', owner: 'Crutchfield', trusted: false, domains: () => ['crutchfield.com'], query: 'no lens included', page: /crutchfield\.com\/(?:[^/]+\/)?p_[A-Za-z0-9]+\//, to: (u) => u.split(/[?#]/)[0], rank: (u, t) => (/no lens|bdy\b|body/i.test(u + t) ? 2 : 0) - (/kit|lens(?! included)|\d{2}-\d{2,3}mm/i.test(u + t) ? 4 : 0) },
  { key: 'wex', title: 'Wex', owner: 'Wex', trusted: false, domains: () => ['wexphotovideo.com'], query: 'digital camera body', page: /wexphotovideo\.com\/[a-z0-9-]+-\d{5,}\/?$/, to: (u) => u.split(/[?#]/)[0], rank: (u, t) => (/body/i.test(u + t) ? 2 : 0) - (/with|lens|kit|\d{2}-\d{2,3}mm|battery/i.test(u + t) ? 4 : 0) },
  { key: 'news', title: 'Launch news', owner: 'news', trusted: false, domains: () => NEWS, query: 'announced price availability', page: /\/(20\d\d|news|article)|[a-z]-[a-z]+-[a-z]/i, rank: (_u, t) => (/announc|launch|unveil|introduc|price/i.test(t) ? 2 : 0) - (/review|vs|hands-on|best/i.test(t) ? 1 : 0) - (/rumou?r|\?|leak|expected|about to|coming soon/i.test(t) ? 10 : 0) },
  { key: 'wikipedia', title: 'Wikipedia', owner: 'Wikipedia', trusted: false, domains: () => ['en.wikipedia.org'], query: 'camera', page: /\/wiki\/(?!Category:|List_of|File:|Talk:|Special:)/ },
  { key: 'mpb', title: 'MPB (used)', owner: 'MPB', trusted: false, domains: () => ['mpb.com'], query: 'used', page: /mpb\.com\/en-us\/product\//, prices: true },
  // eBay's used, Buy It Now listings for the body (its sold listings need a signed-in account).
  { key: 'ebay', title: 'eBay (used)', owner: 'eBay', trusted: false, domains: () => [], query: '', prices: true, direct: (name) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${name} body`).replace(/%20/g, '+')}&_sacat=31388&LH_ItemCondition=3000&LH_BIN=1&_ipg=60&rt=nc` },
];
// Digicamdb, Camera Decision, Versus, DXOMARK and PXLMAG are not used: their data proved unreliable (Kevin, 2026-11-05).
export const SRC: Record<string, Src> = Object.fromEntries(SOURCES.map((s) => [s.key, s]));
// Who stands behind a claim: the maker for its own pages, the site for a news article.
const brandName = (key: string) => Object.keys(BRANDS).find((b) => b.toLowerCase().replace(/\s+/g, '-') === key.split(':')[0]) || '';
// A page an agent found on any other reputable site is its own source, "site:<domain>", owned by that site.
export const isSite = (src: string) => src.startsWith('site:');
// A maker's site in another country (canon.co.uk) is still the maker: never an independent source.
const makerSite = (host: string, brand: string) => (VENDOR[brand] || []).some((d) => host === d || host.endsWith(`.${d}`)) || new RegExp(`(^|\\.)(${(brand.split(' ')[0] || '-').toLowerCase()}|${brand.toLowerCase().replace(/\s+/g, '')})(-[a-z]+)?\\.`).test(`${host}.`.replace(/\.(co\.)?[a-z]{2,3}\.$/, '.'));
// A page on a known source's site (a maker's manual, a second B&H page) belongs to that source's owner.
const knownOwner = (host: string, brand: string) => { const s = SOURCES.find((x) => x.key !== 'news' && x.domains(brand).some((d) => host === d || host.endsWith(`.${d}`))); return s ? (s.key === 'vendor' || s.key === 'press' ? brand : s.owner) : null; };
export const ownerOf = (src: string, brand: string, url = '') => (src === 'vendor' || src === 'press' ? brand : src === 'news' ? url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : isSite(src) ? (makerSite(src.slice(5), brand) ? brand : knownOwner(src.slice(5), brand) || src.slice(5)) : SRC[src]?.owner || src);

// ---- Firecrawl through Outpost's gateway (the admin's own Firecrawl account).
let toolCache: any[] | null = null;
async function fc(tool: string, args: any): Promise<any> {
  toolCache ||= ((await gateway('tools/list'))?.tools || []) as any[];
  const hits = toolCache.filter((t) => new RegExp(`^firecrawl(-[a-z0-9-]+)?__${tool}$`).test(t.name));
  const t = hits.find((x) => x.name.startsWith('firecrawl__')) || hits[0];
  if (!t) throw new Error('Firecrawl is not connected: add it under Connectors, then Resume.');
  const r = await gateway('tools/call', { name: t.name, arguments: args }, 180_000);
  const text = (r?.content || []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n');
  if (r?.isError) throw new Error(`Firecrawl: ${text.slice(0, 300) || 'failed'}`);
  if (r?.structuredContent) return r.structuredContent;
  const body = text.replace(/^\s*<untrusted[^>]*>\s*|\s*<\/untrusted>\s*$/g, '');
  try { return JSON.parse(body); } catch { return { text: body }; }
}
const OBJECTIVE = 'Build the most reliable, cleanest database of camera specifications, verified across independent sources.';
// A run's own copy of Firecrawl: in tests and the first fetch alike, every call goes through here.
async function search(query: string, domains: string[]) {
  const r = await fc('firecrawl_search', { query, objective: OBJECTIVE, limit: 6, sources: ['web'], ...(domains.length ? { includeDomains: domains } : {}) });
  return ((r?.data?.web || r?.web || r?.data || []) as any[]).filter((x) => x?.url);
}
// Adorama refuses every live reader (DataDome), so its page is read from the Wayback Machine's newest
// copy, through Firecrawl's archive provider. The copy's own address and date are kept with the page.
async function wayback(url: string) {
  const call = async (capability: string, options: any) => {
    const r = await fc('firecrawl_scrape', { alexandria: { provider: 'web-archive-org', capability, options }, objective: OBJECTIVE });
    const x = (r?.data?.alexandria || r?.alexandria || [])[0];
    if (!x || x.error) throw new Error(`Wayback Machine: ${x?.error?.message || x?.error?.code || x?.error || 'no answer'}`);
    return x.data;
  };
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const caps = ((await call('captures/history', { url, date: today }))?.captures || []).filter((c: any) => c.status === 200 && c.timestamp);
  const last = caps.sort((a: any, b: any) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  if (!last) throw new Error(`the Wayback Machine has no copy of ${url} yet`);
  const page = await call('captures/content', { url, timestamp: last.timestamp });
  const t = String(page?.actual_timestamp || last.timestamp);
  const at = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10) || '00'}:${t.slice(10, 12) || '00'}:${t.slice(12, 14) || '00'}Z`;
  return { text: String(page?.text || ''), url: String(page?.archive_url || last.archive_url), at };
}
export async function scrape(url: string, fresh: boolean, wait = 0, raw = false) {
  const r = await fc('firecrawl_scrape', { url, objective: OBJECTIVE, formats: raw ? ['markdown', 'rawHtml'] : ['markdown'], onlyMainContent: true, ...(wait ? { waitFor: wait } : {}), ...(fresh ? { maxAge: 0 } : {}) });
  const d = r?.data || r;
  if (!d?.markdown && d?.metadata?.statusCode >= 400) throw new Error(`HTTP ${d.metadata.statusCode} from ${url}`);
  return { markdown: String(d?.markdown || ''), meta: d?.metadata || {}, raw: String(d?.rawHtml || '') };
}
// B&H's own pictures of each product, from the data its listing page carries (a data-data attribute):
// the main picture is the straight-on front (a body's sensor showing), the first secondary picture the
// straight-on back (the one a listing tile shows on hover). B&H labels no view; this order is its
// convention, checked on six bodies (2026-11-05). Each at the sizes its image host keeps, largest first.
const BH_IMAGES = process.env.CAMERA_ATLAS_BH_IMAGES || 'https://static.bhphoto.com/images';
export function bhPictures(raw: string) {
  const html = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const out: Record<string, { front: string[]; back: string[] }> = {};
  for (const m of html.matchAll(/"imageInfo":\{"images":\[\{"isKitHeader":false,"note":"[^"]*"[\s\S]*?"images":\[([\s\S]*?)\]\}\]/g)) {
    const urls = [...m[1].matchAll(/"detail":\{"url":"([^"]+)"/g)].map((x) => x[1].replace(/^.*\//, ''));
    const main = urls[0]?.match(/^(?:.*_)?(\d{9,})_(\d+)\.jpg$/), back = urls[1]?.match(/^(\d+_IMG_\d+)\.jpg$/);
    if (!main) continue;
    out[main[2]] = {
      front: [`${BH_IMAGES}/images2500x2500/${urls[0]}`, ...['2500x2500', '1500x1500', '1000x1000'].map((s) => `${BH_IMAGES}/images${s}/${main[1]}_${main[2]}.jpg`)],
      back: back ? ['1500x1500', '1000x1000'].map((s) => `${BH_IMAGES}/multiple_images/images${s}/${back[1]}.jpg`) : [],
    };
  }
  return out;
}

// ---- Steps.
export interface Def { key: string; title: string; net: boolean; deps: string[]; grp?: string; sub?: string }
export const DEFS: Def[] = [
  { key: 'discover', title: 'Discover cameras', net: true, deps: [], sub: 'page' },
  { key: 'corpus', title: 'Pick the corpus', net: false, deps: ['discover'] },
  { key: 'locate', title: 'Find each camera on each source', net: true, deps: ['corpus'], grp: 'camera', sub: 'source' },
  { key: 'scrape', title: 'Scrape pages to Markdown', net: true, deps: ['locate'], grp: 'camera', sub: 'page' },
  { key: 'consensus', title: 'Verify and standardize', net: false, deps: ['scrape'], grp: 'camera', sub: 'spec' },
  { key: 'images', title: 'Cut out product images', net: true, deps: ['consensus'], grp: 'camera', sub: 'view' },
];
const DEF = Object.fromEntries(DEFS.map((d) => [d.key, d]));
const TERMINAL = new Set(['done', 'partial', 'failed', 'skipped']);
export const latestRun = () => one('SELECT * FROM runs ORDER BY id DESC LIMIT 1');
// A run made before a step existed gets that step, pending, when it is read.
export const step = (run: number, key: string) => {
  const s = one('SELECT * FROM steps WHERE run_id = ? AND key = ?', run, key);
  if (s) return s;
  db.prepare("INSERT OR IGNORE INTO steps (run_id, key, state, updated_at) VALUES (?, ?, 'pending', ?)").run(run, key, now());
  return one('SELECT * FROM steps WHERE run_id = ? AND key = ?', run, key);
};
const data = (run: number, key: string) => J(step(run, key)?.data);
function setStep(run: number, key: string, f: Record<string, unknown>) {
  const ks = Object.keys(f);
  db.prepare(`UPDATE steps SET ${ks.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE run_id = ? AND key = ?`).run(...(ks.map((k) => f[k]) as any[]), now(), run, key);
}
export function newRun(fresh: boolean) {
  const size = setting('size', Number(process.env.CAMERA_ATLAS_SIZE || 400));
  const id = Number(db.prepare("INSERT INTO runs (created_at, fresh, state, size) VALUES (?, ?, 'running', ?)").run(now(), fresh ? 1 : 0, size).lastInsertRowid);
  for (const d of DEFS) db.prepare("INSERT INTO steps (run_id, key, state, updated_at) VALUES (?, ?, 'pending', ?)").run(id, d.key, now());
  return id;
}
const outs = (run: number, key: string) => all("SELECT id, grp, sub, args, out FROM tasks WHERE run_id = ? AND step = ? AND state = 'done' ORDER BY seq", run, key).map((t) => ({ ...t, args: J(t.args), out: J(t.out) }));
function contentHash(run: number, key: string) {
  if (DEF[key].net) return sha(JSON.stringify(outs(run, key).map((t) => [t.id, t.out])));
  return sha(step(run, key).data);
}
const inputsOf = (run: number, d: Def) => JSON.stringify(d.deps.map((k) => step(run, k).hash || step(run, k).state));
function finish(run: number, key: string, state: string, error: string | null = null) {
  setStep(run, key, { state, error, hash: state === 'skipped' ? 'skipped' : contentHash(run, key), inputs: inputsOf(run, DEF[key]), doing: null });
}

// The tasks a network step should have now, from what its inputs made. Tasks already done with the
// same arguments are kept (a retry redoes only what changed); others are replaced.
interface Want { id: string; grp?: string; sub?: string; args: any }
function wanted(run: number, d: Def): Want[] {
  const r = one('SELECT * FROM runs WHERE id = ?', run);
  if (d.key === 'discover') return [{ id: 'page-1', sub: 'page 1', args: { kind: 'listing', page: 1 } }];
  const cams = cameras(run);
  if (d.key === 'locate') return cams.flatMap((c) => SOURCES.filter((s) => s.key !== 'vendor' || VENDOR[c.brand]).map((s) => ({ id: `${c.id}|${s.key}`, grp: c.name, sub: s.title, args: { kind: 'locate', camera: c.id, name: c.name, brand: c.brand, source: s.key, known: s.key === 'bh' ? c.info.bh : undefined } })));
  if (d.key === 'images') {
    const f = new Map(all('SELECT camera, spec, fact FROM facts WHERE run_id = ? AND spec IN (?, ?)', run, 'image_front', 'image_back').map((x) => [`${x.camera}|${x.spec}`, J(x.fact)]));
    return cams.flatMap((c) => (['front', 'back'] as const).map((side) => ({ id: `${c.id}|${side}`, grp: c.name, sub: side, args: { kind: 'image', camera: c.id, name: c.name, brand: c.brand, side, bh: c.info.bhPictures?.[side] || [], urls: (f.get(`${c.id}|image_${side}`)?.value?.candidates || []).map((x: any) => x.url).slice(0, 6) } })));
  }
  if (d.key === 'scrape') return outs(run, 'locate').filter((t) => t.out.url).map((t) => ({ id: t.id, grp: t.grp, sub: t.sub, args: { kind: 'scrape', camera: t.args.camera, source: t.args.source, url: t.out.url, fresh: !!r.fresh } }));
  return [];
}
function seed(run: number, d: Def) {
  const want = wanted(run, d), have = new Map(all('SELECT id, args, state FROM tasks WHERE run_id = ? AND step = ?', run, d.key).map((t) => [t.id, t]));
  tx(() => {
    const ids = new Set(want.map((w) => w.id));
    for (const id of have.keys()) if (!ids.has(id) && !(d.key === 'discover' && id.startsWith('page-'))) db.prepare('DELETE FROM tasks WHERE run_id = ? AND step = ? AND id = ?').run(run, d.key, id);
    want.forEach((w, i) => {
      const t = have.get(w.id);
      if (t && t.args === JSON.stringify(w.args)) return;
      db.prepare("INSERT OR REPLACE INTO tasks (run_id, step, id, seq, grp, sub, args, state, tries) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)").run(run, d.key, w.id, i + 1, w.grp ?? null, w.sub ?? null, JSON.stringify(w.args));
    });
  });
}

// ---- What each task does.
const blocks = (md: string) => md.split(/\n(?=### \[)/).slice(1);
// A B&H listing page: each product's title, link, item number, price, used price and key features.
export function listing(md: string) {
  const items = blocks(md).map((b) => {
    const h = b.match(/^### \[([^\]]+)\]\((https:\/\/www\.bhphotovideo\.com\/c\/product\/(\d+)-REG\/[^)\s]+)\)/);
    if (!h) return null;
    const feats = (b.split(/Key Features/)[1] || '').split(/Show\s+More/)[0].split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean);
    const cents = b.match(/\n\$([\d,]+)(\d\d)\n/), used = b.match(/Used\s*from\s*\$([\d,]+(?:\.\d\d)?)/i);
    return { title: h[1], url: h[2], item: Number(h[3]), features: feats, price: cents ? Number(cents[1].replace(/,/g, '')) + Number(cents[2]) / 100 : null, used: used ? Number(used[1].replace(/,/g, '')) : null, newArrival: /New Arrival/i.test(b) };
  }).filter(Boolean) as any[];
  const last = Math.max(1, ...[...md.matchAll(/\/pn\/(\d+)[?#)]/g)].map((m) => Number(m[1])));
  return { items, last };
}
// An accessory "for" a camera (a cage, a case, a grip) is never that camera's page.
export const ACCESSORY = /\b(cage|case|strap|grip|battery|charger|protector|body cap|lens cap|bag|tripod|adapter|rig|kit for|bundle|for (the )?(sony|canon|nikon|panasonic|leica|sigma|fuji))\b/i;
const pageOk = (s: Src, url: string, title = '') => (!s.page || s.page.test(url)) && (s.key === 'vendor' || s.key === 'press' || !ACCESSORY.test(`${title} ${decodeURIComponent(url).replace(/[-_/]+/g, ' ')}`));
// Does this search result name exactly this camera? A run of words in its title or link reads as its key,
// next to its brand (a maker's own site may leave the brand out). A comparison, or a page naming
// another brand, is never this camera's page.
export function names(text: string, key: string, brand: string, ownSite = false) {
  if (/\bvs\.?\b|\bversus\b|\bcompar/i.test(text.replace(/[_-]+/g, ' '))) return false;
  if (Object.keys(BRANDS).some((b) => b !== brand && BRANDS[b].test(text))) return false;
  if (!ownSite && !BRANDS[brand]?.test(text)) return false;
  const w = text.replace(/[_/|:–—,]+|\.html?|-(?=[a-z]{3,})/gi, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 6 && i + n <= w.length; n++) if (cameraKey(w.slice(i, i + n).join(' '), brand) === key) return true;
  return false;
}
// B&H's digital cameras, every type and sensor, body only, newest first (Kevin's link).
const FILTER = '?sort=NEWEST&filters=fct_bodies-kits_4023%3Abody-only%3AREGULAR';
const LISTING = 'https://www.bhphotovideo.com/c/products/Digital-Cameras/ci/9811/N/4288586282';
export const listingUrl = (page: number) => `${LISTING}${page > 1 ? `/pn/${page}` : ''}${FILTER}`;
// A listing that is a camera body sold new (mirrorless, DSLR, rangefinder, cinema or compact): not refurbished, open
// box or used, and not a kit with a lens (B&H's sponsored slots show kits even under its body-only filter).
export const isBody = (title: string) => /\bcamera\b/i.test(title) && !/refurbished|open box|\bused\b|demo/i.test(title) && !/\bwith\b.*\blens\b|\b\d+(-\d+)?mm\b/i.test(title);
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
// A page kept as it was read: front matter (url, source, camera, when), then the page's Markdown.
export function savePage(run: number, camera: string, source: string, url: string, md: string, meta: any, asked = url, extra?: any) {
  const at = now(), scraped = meta.cachedAt && meta.cacheState === 'hit' ? new Date(meta.cachedAt).toISOString() : at;
  const dir = join(PAGES, source);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug(camera)}--${sha(url + at).slice(0, 8)}.md`);
  writeFileSync(file, `---\nurl: ${url}\nsource: ${source}\ncamera: ${camera}\ntitle: ${JSON.stringify(meta.title || '')}\nscraped_at: ${scraped}\nfetched_at: ${at}\n---\n\n${md}`);
  if (extra) writeFileSync(`${file}.json`, JSON.stringify(extra));
  db.prepare('INSERT INTO pages (run_id, camera, source, url, title, file, chars, scraped_at, fetched_at, asked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(run, camera, source, url, String(meta.title || ''), file, md.length, scraped, at, asked);
  return { file, chars: md.length, scraped_at: scraped };
}
// A page fetched in the last month is never fetched again (Kevin, 2026-11-05): its saved Markdown is
// used, and this run gets a row for it that keeps the original fetch time, so the month runs from then.
export const CACHE_DAYS = Number(process.env.CAMERA_ATLAS_CACHE_DAYS ?? 30);
const since = () => new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
export function cached(run: number, asked: string, camera?: string, source?: string) {
  const r = camera
    ? one('SELECT * FROM pages WHERE camera = ? AND source = ? AND fetched_at >= ? ORDER BY id DESC LIMIT 1', camera, source, since())
    : one('SELECT * FROM pages WHERE (url = ? OR asked = ?) AND fetched_at >= ? ORDER BY id DESC LIMIT 1', asked, asked, since());
  if (!r || !existsSync(r.file)) return null;
  if (!one('SELECT 1 FROM pages WHERE run_id = ? AND file = ?', run, r.file))
    db.prepare('INSERT INTO pages (run_id, camera, source, url, title, file, chars, scraped_at, fetched_at, asked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(run, r.camera, r.source, r.url, r.title, r.file, r.chars, r.scraped_at, r.fetched_at, r.asked ?? r.url);
  const extra = existsSync(`${r.file}.json`) ? J(readFileSync(`${r.file}.json`, 'utf8')) : null;
  return { row: r, markdown: readPage(r.file).markdown, extra, out: { file: r.file, chars: r.chars, scraped_at: r.scraped_at, url: r.url, cached: r.fetched_at } };
}
async function perform(run: number, a: any): Promise<{ out: any; next?: Want[] }> {
  if (a.kind === 'listing') {
    const url = listingUrl(a.page);
    // A saved listing counts only with its picture record (copies saved before pictures were read have none).
    const saved = cached(run, url);
    const hit = saved?.extra?.pictures ? saved : null;
    const got = hit ? { markdown: hit.markdown, meta: {}, raw: '' } : await scrape(url, !!one('SELECT fresh FROM runs WHERE id = ?', run).fresh, 0, true);
    const { markdown, meta } = got;
    const l = listing(markdown);
    const pics = hit ? hit.extra?.pictures || {} : bhPictures(got.raw);
    for (const it of l.items) if (pics[it.item]) it.pictures = pics[it.item];
    if (!l.items.length) throw new Error(`no listings read on page ${a.page}`);
    if (!hit) savePage(run, 'listing', 'bh-listing', url, markdown, meta, url, { pictures: pics });
    // The next page only while the corpus still needs cameras (counted as pickCorpus counts them).
    const size = one('SELECT size FROM runs WHERE id = ?', run).size;
    const seen = new Set([...outs(run, 'discover').flatMap((t) => t.out.items || []), ...l.items].filter((i: any) => isBody(i.title)).map((i: any) => cameraKey(i.title)));
    const more = seen.size < size && a.page < l.last;
    return { out: { items: l.items, last: l.last, page: a.page }, next: more ? [{ id: `page-${a.page + 1}`, sub: `page ${a.page + 1}`, args: { kind: 'listing', page: a.page + 1 } }] : [] };
  }
  if (a.kind === 'locate') {
    const s = SRC[a.source], key = a.camera;
    if (a.known) return { out: { url: s.to!(a.known), via: 'listing' } };
    const saved = cached(run, '', a.camera, a.source);
    if (saved && pageOk(s, saved.row.asked || saved.row.url, saved.row.title)) return { out: { url: saved.row.asked || saved.row.url, via: `saved ${saved.row.fetched_at.slice(0, 10)}` } };
    if (s.direct) return { out: { url: s.direct(a.name), via: 'search page' } };
    const results = await search(`${a.name} ${s.query}`, s.domains(a.brand));
    const own = a.source === 'vendor' || a.source === 'press';
    if (s.rank) results.sort((x: any, y: any) => s.rank!(y.url, y.title || '') - s.rank!(x.url, x.title || ''));
    const hit = results.find((r) => (!s.rank || s.rank(r.url, r.title || '') > -5) && pageOk(s, r.url, r.title) && (names(r.title || '', key, a.brand, own) || names(`${own ? '' : a.brand} ${decodeURIComponent(r.url.split(/[?#]/)[0].split('/').slice(3).join(' '))}`, key, a.brand, own)));
    return { out: hit ? { url: s.to ? s.to(hit.url) : hit.url, title: hit.title, via: 'search' } : { url: null, missing: `no ${s.title} page for ${a.name} among ${results.length} results` } };
  }
  if (a.kind === 'scrape') {
    const hit = cached(run, a.url);
    if (hit) return { out: hit.out };
    // Makers' pages build their specs with script: Firecrawl waits for them.
    const maker = a.source === 'vendor' || a.source === 'press';
    if (a.source === 'adorama') {
      const w = await wayback(a.url);
      const md = flatSpecs(w.text);
      if (specRows(md) < 5) throw new Error(`the Wayback copy of ${a.url} (${w.at.slice(0, 10)}) holds no spec sheet`);
      return { out: { ...savePage(run, a.camera, a.source, w.url, md, { title: `Adorama, as archived ${w.at.slice(0, 10)}`, cachedAt: w.at, cacheState: 'hit' }, a.url), url: w.url } };
    }
    let url = a.url, { markdown, meta } = await scrape(url, a.fresh, maker ? 5000 : 0);
    if (a.source === 'dpreview' && !/\/products\//.test(url)) {
      const brand = brandName(a.camera);
      const prod = [...new Set([...markdown.matchAll(/https:\/\/www\.dpreview\.com\/products\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9_-]+/gi)].map((m) => m[0]))]
        .find((u) => names(`${brand} ${u.split('/').pop()!.replace(/_/g, ' ')}`, a.camera, brand));
      // No product page yet for a new camera: the review is kept, and only its own spec sheet is read.
      if (prod) {
        url = `${prod}/specifications`;
        ({ markdown, meta } = await scrape(url, a.fresh));
      }
    }
    // A maker's overview page that holds few specs: its own spec page instead, when it links one.
    if (a.source === 'vendor' && specRows(markdown) < 10) {
      const host = new URL(url).host;
      const link = [...markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]).find((u) => /spec|technical|tech-data/i.test(u) && !/#/.test(u) && new URL(u).host === host && u !== url);
      if (link) { const next = await scrape(link, a.fresh, 5000); if (specRows(next.markdown) > specRows(markdown)) ({ markdown, meta } = next), (url = link); }
    }
    if (markdown.length < 200) throw new Error(`only ${markdown.length} characters read from ${url}`);
    return { out: { ...savePage(run, a.camera, a.source, url, markdown, meta, a.url), url } };
  }
  if (a.kind === 'image') return { out: await findPictures(a) };
  throw new Error(`unknown task ${a.kind}`);
}
async function attempt<T>(f: () => Promise<T>, waiting: (s: string) => void): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await f(); } catch (e) {
      const m = why(e);
      if (AUTH.test(m) || /not connected/i.test(m) || i >= 3) throw e;
      const rate = RATE.test(m), ms = rate ? RETRY_MS * 10 * 2 ** (i - 1) : RETRY_MS * i;
      waiting(`${rate ? 'rate limited' : 'failed'}; trying again in ${Math.max(1, Math.round(ms / 1000))}s (${i + 1} of 3)`);
      await sleep(ms);
    }
  }
}

// ---- Pictures: a front and a back for every camera, each transparent, over 1,000 pixels on its long edge, of the bare
// body, straight on. Found among the pages read and by a Firecrawl image search; each candidate's file
// is checked here, then a reviewing agent looks at it (only a model can see a lens or a hand). One
// approved picture per view is kept for good and never fetched again.
const IMG_DIR = () => join(dirname(PAGES), 'images');
const isBH = (u: string) => u.startsWith(BH_IMAGES) || /bhphoto(video)?\.com\/images\//.test(u);
// The original behind a resized copy: Shopify's width=, WordPress's -548x548, a ?w=.
export const original = (u: string) => u.replace(/([?&])(width|w|h|height|resize|fit)=[^&]*/gi, '$1').replace(/[?&]+$/, '').replace(/-\d{2,4}x\d{2,4}(\.(png|webp|jpe?g))/i, '$1');
const NOT_BODY = /\blens\b|\bkit\b|\bw\/|\bwith\b|\+|\d{2,3}(-\d{2,3})?\s?mm|grip|cage|battery|strap|bundle|vs\.?\b|compar|sample|review/i;
async function findPictures(a: any) {
  // A kept picture stays for good, unless it came from elsewhere and B&H's own is not yet checked: B&H's
  // pictures are the standard, and replace it once approved.
  const kept = one('SELECT url FROM pictures WHERE camera = ? AND side = ?', a.camera, a.side);
  const bhTried = (a.bh || []).some((u: string) => one('SELECT 1 FROM candidates WHERE camera = ? AND side = ? AND url = ?', a.camera, a.side, u));
  if (kept && (isBH(kept.url) || !a.bh?.length || bhTried)) return { kept: kept.url };
  // B&H's own picture of this view first, its white backdrop taken away; a search only when it fails.
  const seenBefore = new Set(all('SELECT url FROM candidates WHERE camera = ? AND side = ?', a.camera, a.side).map((x) => x.url));
  if (a.bh?.length && !a.bh.some((u: string) => seenBefore.has(u))) {
    const c = candidate(a.bh, IMG_DIR(), `${slug(a.camera)}-${a.side}-bh`, true);
    const ok = 'file' in c;
    db.prepare('INSERT OR IGNORE INTO candidates (camera, side, url, page, title, file, thumb, look, width, height, state, why, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      a.camera, a.side, ok ? c.url : a.bh[0], 'https://www.bhphotovideo.com/', `B&H ${a.side === 'front' ? 'main' : 'first secondary'} picture`, ok ? c.file : null, ok ? c.thumb : null, ok ? c.look : null, ok ? c.width : null, ok ? c.height : null, ok ? 'review' : 'rejected', ok ? null : `file: ${c.reject}`, now());
    if (ok) return { review: 1, from: 'B&H' };
  }
  if (kept) return { kept: kept.url };
  if (one("SELECT 1 FROM candidates WHERE camera = ? AND side = ? AND state = 'review'", a.camera, a.side)) return { review: 1 };
  const queries = [`"${a.name}" ${a.side} -lens -kit`, `"${a.name}" body ${a.side} png`, `${a.name} ${a.side === 'back' ? 'rear' : 'front'} view body only transparent`];
  const found: Array<{ url: string; page?: string; title?: string }> = a.urls.map((url: string) => ({ url }));
  for (const q of queries) {
    const r = await fc('firecrawl_search', { query: q, objective: 'Find a transparent, body-only product picture of this camera, straight on.', limit: 20, sources: ['images'] });
    for (const x of (r?.data?.images || r?.images || []) as any[]) {
      if (!x?.imageUrl || NOT_BODY.test(x.title || '')) continue;
      if (!names(`${x.title || ''} ${decodeURIComponent(x.imageUrl)}`, a.camera, a.brand, true) && !names(x.title || '', a.camera, a.brand)) continue;
      if (/\.(jpe?g|gif|avif)(\?|$)/i.test(x.imageUrl)) continue; // never transparent
      found.push({ url: original(x.imageUrl), page: x.url, title: x.title });
    }
  }
  const seen = new Set(all('SELECT url FROM candidates WHERE camera = ? AND side = ?', a.camera, a.side).map((x) => x.url));
  const fresh = found.filter((x, i) => !seen.has(x.url) && found.findIndex((y) => y.url === x.url) === i);
  const pngFirst = fresh.sort((x, y) => Number(!/\.png/i.test(y.url)) - Number(!/\.png/i.test(x.url)));
  const why: string[] = [];
  let good = 0;
  for (const x of pngFirst.slice(0, 16)) {
    if (good >= 4) break;
    const c = candidate(x.url, IMG_DIR(), `${slug(a.camera)}-${a.side}-${sha(x.url).slice(0, 8)}`);
    const ok = 'file' in c;
    db.prepare('INSERT OR IGNORE INTO candidates (camera, side, url, page, title, file, thumb, look, width, height, state, why, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      a.camera, a.side, x.url, x.page ?? null, x.title ?? null, ok ? c.file : null, ok ? c.thumb : null, ok ? c.look : null, ok ? c.width : null, ok ? c.height : null, ok ? 'review' : 'rejected', ok ? null : `file: ${c.reject}`, now());
    if (ok) good++;
    else why.push(c.reject);
  }
  const waiting = one("SELECT count(*) AS n FROM candidates WHERE camera = ? AND side = ? AND state = 'review'", a.camera, a.side).n;
  if (!waiting) throw new Error(`no transparent ${a.side} picture over ${MIN_PX - 1} px among ${fresh.length} new candidates (${[...new Set(why)].slice(0, 3).join('; ') || 'none found'})`);
  return { review: waiting, checked: Math.min(16, fresh.length) };
}
// The reviewer's queue, a few at a time, each with the picture itself (on grey) for it to look at.
export function reviewQueue(limit = 6) {
  const rows = all("SELECT * FROM candidates WHERE state = 'review' ORDER BY camera, side, id LIMIT ?", limit);
  const name = (id: string) => one('SELECT name FROM cameras WHERE id = ? ORDER BY run_id DESC LIMIT 1', id)?.name || id;
  const left = one("SELECT count(*) AS n FROM candidates WHERE state = 'review'").n;
  return { left, items: rows.map((r) => ({ id: r.id, camera: name(r.camera), side: r.side, size: `${r.width}×${r.height}`, from: r.page || r.url, look: r.look })) };
}
// The reviewer's verdict. The first approved picture of a view is kept; a view whose every candidate is
// rejected fails its task, so Retry searches again (never rechecking a rejected picture).
export function judge(id: number, ok: boolean, why: string) {
  const r = one('SELECT * FROM candidates WHERE id = ?', id);
  if (!r) throw new Error(`No candidate ${id}.`);
  if (r.state !== 'review') return { id, state: r.state };
  db.prepare('UPDATE candidates SET state = ?, why = ? WHERE id = ?').run(ok ? 'approved' : 'rejected', why, id);
  const had = one('SELECT url FROM pictures WHERE camera = ? AND side = ?', r.camera, r.side);
  if (ok && had && isBH(r.url) && !isBH(had.url)) db.prepare('DELETE FROM pictures WHERE camera = ? AND side = ?').run(r.camera, r.side);
  if (ok && !one('SELECT 1 FROM pictures WHERE camera = ? AND side = ?', r.camera, r.side)) {
    // Kept under a permanent name (sony-a7v-front.png), which every later run uses as it is.
    const file = join(IMG_DIR(), `${slug(r.camera)}-${r.side}.png`), thumb = join(IMG_DIR(), `${slug(r.camera)}-${r.side}-thumb.png`);
    copyFileSync(r.file, file);
    copyFileSync(r.thumb, thumb);
    db.prepare('INSERT INTO pictures (camera, side, url, page, file, thumb, width, height, approved_at, why) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(r.camera, r.side, r.url, r.page, file, thumb, r.width, r.height, now(), why);
    db.prepare("UPDATE candidates SET state = 'spare', why = 'a picture of this view was already approved' WHERE camera = ? AND side = ? AND state = 'review'").run(r.camera, r.side);
  }
  const has = one('SELECT 1 FROM pictures WHERE camera = ? AND side = ?', r.camera, r.side);
  const waiting = one("SELECT count(*) AS n FROM candidates WHERE camera = ? AND side = ? AND state = 'review'", r.camera, r.side).n;
  if (!has && !waiting) {
    const reasons = all("SELECT why FROM candidates WHERE camera = ? AND side = ? AND state = 'rejected' AND why NOT LIKE 'file:%' ORDER BY id DESC LIMIT 3", r.camera, r.side).map((x) => x.why);
    const latest = latestRun();
    if (latest) {
      db.prepare("UPDATE tasks SET state = 'failed', error = ? WHERE run_id = ? AND step = 'images' AND id = ?").run(`every ${r.side} picture found was rejected: ${reasons.join('; ')}`, latest.id, `${r.camera}|${r.side}`);
      db.prepare("UPDATE steps SET state = 'partial', error = 'some cameras have no approved picture yet; Retry searches again' WHERE run_id = ? AND key = 'images'").run(latest.id);
      db.prepare("UPDATE runs SET state = 'partial' WHERE id = ? AND state = 'done'").run(latest.id);
    }
  }
  return { id, state: ok ? 'approved' : 'rejected', kept: !!has };
}
export const REVIEW_PROMPT = `You are reviewing product pictures for Cambench, a camera database. Call review_queue to get the next pictures (each shown on grey; grey is where the picture is transparent). For each one, decide, then call judge_picture with its id, ok, and a short reason. Approve only when ALL of these hold:
- exactly one camera, and it is the named model (check the model name or badge printed on it where visible; a different model is a rejection)
- the bare body: NO lens attached. For a front view the lens mount ring and the sensor (or its shutter curtain) are visible. A body cap is acceptable only if no better picture appears; prefer the sensor showing
- the requested side, straight on: front = facing the camera's front squarely; back = the rear screen and controls facing squarely. Reject three-quarter, angled, top, side or tilted views
- the whole camera in frame, nothing cut off; no hands, straps, grips, cages, battery grips, accessories, text, watermarks, price tags or badges overlaid
- a clean product shot, not a photo of the camera in use
Be strict: a rejected picture is replaced by another search, an approved one is used for good. Keep calling review_queue until it says nothing is left, then reply with one line: how many you approved and rejected.`;

// ---- Local steps: the corpus, extraction and reconciliation, from what is already kept.
export const cameras = (run: number) => all('SELECT * FROM cameras WHERE run_id = ? ORDER BY rank', run).map((c) => ({ ...c, info: J(c.info) }));
function pickCorpus(run: number) {
  const size = one('SELECT size FROM runs WHERE id = ?', run).size;
  const extra: string[] = setting('include', []), exclude: string[] = setting('exclude', []).map((n: string) => cameraKey(n));
  const found = new Map<string, any>();
  const pages = outs(run, 'discover').sort((x, y) => (x.out.page || 0) - (y.out.page || 0));
  let pos = 0;
  for (const t of pages) for (const it of t.out.items || []) {
    pos++;
    if (!isBody(it.title)) continue;
    const brand = brandOf(it.title), key = cameraKey(it.title, brand);
    const c = found.get(key) || { id: key, brand, titles: [] as string[], pos, item: it.item, listings: [] as any[] };
    c.titles.push(it.title);
    c.listings.push(it);
    found.set(key, c);
  }
  // Newest first, as B&H sorts them.
  const picked = [...found.values()].filter((c) => !exclude.includes(c.id)).sort((a, b) => a.pos - b.pos).slice(0, size);
  for (const n of extra) {
    const brand = brandOf(n), key = cameraKey(n, brand);
    if (!picked.some((p) => p.id === key)) picked.push(found.get(key) || { id: key, brand, titles: [n], item: 0, listings: [] });
  }
  tx(() => {
    db.prepare('DELETE FROM cameras WHERE run_id = ?').run(run);
    picked.forEach((c, i) => {
      // The plain body: the shortest title (no firmware edition), the earliest listing among equals.
      const body = [...c.listings].sort((a: any, b: any) => Number(/\bwith\b|kit|bundle|firmware/i.test(a.title)) - Number(/\bwith\b|kit|bundle|firmware/i.test(b.title)) || a.title.length - b.title.length || a.item - b.item)[0];
      db.prepare('INSERT INTO cameras (run_id, id, name, brand, rank, info) VALUES (?, ?, ?, ?, ?, ?)').run(run, c.id, displayName(c.titles, c.brand), c.brand, i + 1,
        JSON.stringify({ bh: body?.url || null, bhItem: body?.item || null, bhPictures: body?.pictures || (body?.item ? { front: ['2500x2500', '1500x1500', '1000x1000'].map((s) => `${BH_IMAGES}/images${s}/${body.item}.jpg`), back: [] } : null), listed: c.pos || null, price: body?.price ?? null, used: body?.used ?? null, features: body?.features || c.listings[0]?.features || [], listedAs: [...new Set(c.titles)] }));
    });
  });
  return { cameras: picked.map((c) => c.id), candidates: found.size };
}
export const pageSha = (file: string) => sha(readPage(file).markdown);
// What a reading is filed under: the page's content and the camera it was read for (one list page can
// speak for several cameras, each its own reading).
export const readKey = (p: { file: string; camera: string }) => sha(`${pageSha(p.file)}|${p.camera}`);
export const rekey = (contentSha: string, camera: string) => sha(`${contentSha}|${camera}`);
export const readPage = (file: string) => {
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const m = raw.match(/^---\n([\s\S]*?)\n---\n\n?/);
  const front = Object.fromEntries((m?.[1] || '').split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  return { front, markdown: m ? raw.slice(m[0].length) : raw };
};
// The latest saved page for each camera and source in this run.
export function pagesOf(run: number, camera: string) {
  // This run's pages, plus pages found for this camera on other sites in any run (an agent's find stays
  // found; the 30-day reuse decides when its content is fetched again).
  const rows = all("SELECT * FROM pages WHERE camera = ? AND (run_id = ? OR (source LIKE 'site:%' AND run_id <= ?)) ORDER BY id DESC", camera, run, run);
  const seen = new Set<string>();
  // An added site's pages are each its own (a maker's manual has several); other sources keep their latest.
  return rows.filter((r) => ((isSite(r.source) && !/rumou?rs?\./i.test(r.source) && !seen.has(r.url) && seen.add(r.url)) || (SRC[r.source] && (r.source === 'adorama' || r.source === 'ebay' || pageOk(SRC[r.source], r.asked || r.url, r.title)))) && !seen.has(r.source) && seen.add(r.source));
}
// Prices, dates and pictures, which a page gives outside its spec tables.
export function ebayListings(md: string, key: string, brand: string) {
  const out: Array<{ title: string; price: number }> = [];
  const re = /\[((?:\\\]|[^\]])+?)Opens in a new window or tab\]\(https:\/\/www\.ebay\.com\/itm\/\d+[^)]*\)([\s\S]{0,600}?)\n\s*\$([\d,]+\.\d\d)(?!\s*to)/g;
  for (const m of md.matchAll(re)) {
    const title = m[1].replace(/\\/g, '').trim();
    if (/\blens\b|\bkit\b|\bw\/|\bwith\b|\d{2,3}(-\d{2,3})?mm|parts|repair|broken|as[- ]is|not working|for spares|\bbox only\b|grip only|cage|battery only|screen protector/i.test(title)) continue;
    if (!/pre-?owned|used/i.test(m[2])) continue;
    if (!names(title, key, brand)) continue;
    out.push({ title, price: Number(m[3].replace(/,/g, '')) });
  }
  // Prices far from the middle (a misfiled part, a bundle) are left out.
  const sorted = out.map((x) => x.price).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  return out.filter((x) => x.price >= med * 0.65 && x.price <= med * 1.5);
}
// Prices a retailer's own page gives (B&H's price and used price, MPB's used price, eBay's used Buy It Now
// listings averaged): dated quotes from named sellers.
export function priceQuotes(source: string, md: string, cam: { id: string; brand: string; url: string }) {
  const out: any[] = [];
  if (source === 'bh') {
    const head = md.split(/## .* Specs/)[0];
    const p = head.match(/\n\$([\d,]+\.\d\d)\n/), u = head.match(/Used\s*from\s*\$([\d,]+(?:\.\d\d)?)/i);
    if (p) out.push({ spec: 'price_new', value: Number(p[1].replace(/,/g, '')), raw: `$${p[1]}`, label: 'Price' });
    if (u) out.push({ spec: 'price_used', value: Number(u[1].replace(/,/g, '')), raw: `Used from $${u[1]}`, label: 'Used from' });
  }
  if (source === 'mpb') {
    const u = md.match(/(?:from|price)[^$\n]{0,20}\$\s?([\d,]+(?:\.\d\d)?)/i);
    if (u) out.push({ spec: 'price_used', value: Number(u[1].replace(/,/g, '')), raw: u[0], label: 'Used from' });
  }
  if (source === 'ebay') {
    const ls = ebayListings(md, cam.id, cam.brand);
    if (ls.length) out.push({ spec: 'price_used', value: Math.round(ls.reduce((n, x) => n + x.price, 0) / ls.length), raw: ls.map((x) => `$${x.price.toLocaleString('en-US')}  ${x.title}`).join('\n'), label: `Average of ${ls.length} used Buy It Now listing${ls.length > 1 ? 's' : ''}` });
  }
  return out;
}
const IMG_SKIP = /\.svg|logo|icon|badge|award|sample_galleries|youtube|ytimg|150x150|images\d{2,3}x\d{2,3}\/|sprite|avatar|payboo|PLCC|banner|thumb|\?resize=200/i;
const PICTURES = new Set(['vendor', 'bh', 'dpreview']);
// Product pictures: transparent PNGs first (DPReview's product shots, then the maker's), never a
// lifestyle photo, a sample, a lens or an accessory. DPReview's first product shot is its front view.
export function imagesOf(source: string, md: string) {
  if (!PICTURES.has(source)) return [];
  let first = true;
  return [...md.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ alt: m[1], url: m[2], source }))
    .filter((i) => /\.(png|jpe?g|webp|avif)(\?|$)/i.test(i.url) && !IMG_SKIP.test(i.url) && !/sample|gallery|review video|lead image|best cameras|on tripod|hands|lifestyle|scene|staff|author|headshot/i.test(`${i.alt} ${i.url}`))
    .filter((i) => source !== 'dpreview' || /\/uploads\/2019\/01\/[0-9a-f]{32}\.png/i.test(i.url))
    .filter((i) => !/accessor|strap|battery|charger|cap_|cameracap|grip|hu-\d|bpl-|evf-\d|lens(?!less)|\d{2}mm/i.test(i.url))
    .map((i) => {
      const t = `${i.alt} ${i.url}`;
      const w = (re: string) => new RegExp(`(^|[^a-z])(${re})([^a-z]|$)`, 'i').test(t);
      const hero = source === 'dpreview' && first;
      if (source === 'dpreview') first = false;
      const side = w('back|rear') ? 'back' : w('front') || hero ? 'front' : w('top|side|left|right|bottom|three[_ -]?quarter|angle|set ?up|cinema') ? 'other' : 'unknown';
      const png = /\.png(\?|$)/i.test(i.url);
      const score = (png ? 4 : 0) + (source === 'dpreview' ? 2 : source === 'vendor' ? 1 : 0) + (hero ? 1 : 0) + (/w=1[2-9]\d\d|w=2\d\d\d|2500x2500|1000px|images\/fb\//i.test(i.url) ? 1 : 0) - (/\.(webp|avif)/i.test(i.url) ? 2 : 0) - (/with[_ -]?lens|kit/i.test(t) ? 3 : 0);
      return { ...i, url: i.url.replace(/\?w=\d+$/, '?w=1600'), side, score };
    })
    .filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i);
}
async function localStep(run: number, key: string) {
  const progress = (i: number, n: number, name: string, sub = '') => setStep(run, key, { data: JSON.stringify({ ...data(run, key), progress: { i, n, name, sub } }), doing: `${name}${sub ? ` › ${sub}` : ''}` });
  if (key === 'corpus') return pickCorpus(run);
  const cams = cameras(run);
  if (key === 'consensus') {
    const made = cams.map((c, i) => {
      progress(i + 1, cams.length, c.name, 'merging what readers recorded');
      return { id: c.id, facts: factsForCamera(run, c) };
    });
    const levels = specLevels(made);
    tx(() => {
      db.prepare('DELETE FROM facts WHERE run_id = ?').run(run);
      for (const m of made) {
        for (const [k, f] of Object.entries(m.facts)) db.prepare('INSERT INTO facts (run_id, camera, spec, fact) VALUES (?, ?, ?, ?)').run(run, m.id, k, JSON.stringify(f));
        db.prepare('INSERT INTO facts (run_id, camera, spec, fact) VALUES (?, ?, ?, ?)').run(run, m.id, 'level', JSON.stringify(levels.find((x) => x.id === m.id)));
      }
    });
    const counts: Record<string, number> = {};
    for (const m of made) for (const f of Object.values(m.facts)) counts[f.status] = (counts[f.status] || 0) + 1;
    return { counts, cameras: made.length };
  }
  return {};
}

// ---- Driving a run: the workflow (workflow.ts) runs one step at a time in order, each through runStep.
function invalidate(run: number) {
  // A finished step whose inputs changed runs again (a network step keeps its unchanged tasks).
  for (const d of DEFS) {
    const s = step(run, d.key);
    if (TERMINAL.has(s.state) && d.deps.every((k) => TERMINAL.has(step(run, k).state)) && s.inputs !== inputsOf(run, d)) setStep(run, d.key, { state: 'pending', error: null });
  }
}
// One step of a run, as a workflow task runs it: skipped when what it is made from made nothing, its tasks
// run (a network step) or its work done (a local one), then finished. Returns its state and any error.
export async function runStep(run: number, key: string): Promise<{ state: string; error: string | null }> {
  const d = DEF[key];
  db.prepare("UPDATE runs SET state = 'running', error = NULL WHERE id = ?").run(run);
  invalidate(run);
  const s = step(run, key);
  if (TERMINAL.has(s.state) && s.inputs === inputsOf(run, d)) return { state: s.state, error: s.error };
  if (d.deps.some((k) => ['failed', 'skipped'].includes(step(run, k).state) && !outs(run, k).length && !Object.keys(data(run, k)).length)) {
    finish(run, key, 'skipped', `skipped: ${d.deps.map((k) => DEF[k].title).join(', ')} made nothing`);
    return { state: 'skipped', error: step(run, key).error };
  }
  setStep(run, key, { state: 'running', error: null, started_at: s.started_at || now() });
  if (!d.net) {
    try {
      const out = await localStep(run, key);
      setStep(run, key, { data: JSON.stringify({ ...out, progress: undefined }) });
      finish(run, key, 'done');
    } catch (e) { finish(run, key, 'failed', why(e)); }
    return { state: step(run, key).state, error: step(run, key).error };
  }
  seed(run, d);
  const stopped = await runTasks(run, d);
  if (stopped) {
    setStep(run, key, { state: 'failed', error: stopped, doing: null });
    db.prepare("UPDATE runs SET state = 'stopped', error = ? WHERE id = ?").run(stopped, run);
    throw new Error(stopped);
  }
  const c = one("SELECT count(*) AS n, coalesce(sum(state = 'done'), 0) AS done, coalesce(sum(state = 'failed'), 0) AS failed FROM tasks WHERE run_id = ? AND step = ?", run, key);
  const first = one("SELECT error FROM tasks WHERE run_id = ? AND step = ? AND state = 'failed' ORDER BY seq LIMIT 1", run, key)?.error;
  finish(run, key, !c.failed ? 'done' : c.done ? 'partial' : 'failed', c.failed ? `${c.failed} of ${c.n} failed; first: ${first}` : null);
  return { state: step(run, key).state, error: step(run, key).error };
}
// The run's state once its last step is done.
export function finishRun(run: number) {
  const bad = all("SELECT key FROM steps WHERE run_id = ? AND state IN ('partial', 'failed', 'skipped')", run).length;
  db.prepare('UPDATE runs SET state = ? WHERE id = ?').run(bad ? 'partial' : 'done', run);
}
// What a step is doing now (its tasks in flight), for the run's log.
export const doing = (run: number, key: string) => step(run, key).doing as string | null;
// Before a run is driven again: tasks a stopped run left behind go back to the queue; with retry only failed
// ones are redone, otherwise (resume) failed and unfinished ones; reprocess redoes verification only.
export function prepare(run: number, mode: 'resume' | 'retry' | 'reprocess') {
  if (mode === 'reprocess') return void setStep(run, 'consensus', { state: 'pending', error: null, hash: null, doing: null });
  db.prepare(`UPDATE tasks SET state = 'pending', tries = 0 WHERE run_id = ? AND state IN (${mode === 'retry' ? "'failed'" : "'failed', 'running'"})`).run(run);
  for (const d of DEFS) if (['failed', 'partial', 'running', 'skipped'].includes(step(run, d.key).state)) setStep(run, d.key, { state: 'pending', error: null, doing: null });
}

const POOL = Number(process.env.CAMERA_ATLAS_POOL || 4);
async function runTasks(run: number, d: Def): Promise<string> {
  let stopped = '';
  const busy = new Set<string>();
  const doing = () => setStep(run, d.key, { doing: [...busy].join(' · ') || null });
  const worker = async () => {
    for (;;) {
      if (stopped || latestRun()?.id !== run) return;
      const t = one(`SELECT * FROM tasks WHERE run_id = ? AND step = ? AND state = 'pending' ORDER BY seq LIMIT 1`, run, d.key);
      if (!t) return;
      db.prepare("UPDATE tasks SET state = 'running' WHERE run_id = ? AND step = ? AND id = ?").run(run, d.key, t.id);
      const label = [t.grp, t.sub].filter(Boolean).join(' › ');
      busy.add(label); doing();
      try {
        const r = await attempt(() => perform(run, J(t.args)), (w) => { busy.delete(label); busy.add(`${label}: ${w}`); doing(); });
        tx(() => {
          db.prepare("UPDATE tasks SET state = 'done', error = NULL, tries = tries + 1, out = ? WHERE run_id = ? AND step = ? AND id = ?").run(JSON.stringify(r.out), run, d.key, t.id);
          let seq = Number(one('SELECT max(seq) AS s FROM tasks WHERE run_id = ? AND step = ?', run, d.key).s);
          for (const n of r.next || []) db.prepare("INSERT OR IGNORE INTO tasks (run_id, step, id, seq, grp, sub, args, state) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')").run(run, d.key, n.id, ++seq, n.grp ?? null, n.sub ?? null, JSON.stringify(n.args));
        });
      } catch (e) {
        const m = why(e);
        const auth = AUTH.test(m) || /not connected/i.test(m);
        db.prepare('UPDATE tasks SET state = ?, error = ?, tries = tries + 1 WHERE run_id = ? AND step = ? AND id = ?').run(auth ? 'pending' : 'failed', m, run, d.key, t.id);
        if (auth) stopped = `Firecrawl stopped the fetch: ${m}. Reconnect it under Connectors, then Resume.`;
      } finally {
        for (const b of [...busy]) if (b.startsWith(label)) busy.delete(b);
        doing();
      }
    }
  };
  await Promise.all(Array.from({ length: POOL }, worker));
  // A task left running by a worker that stopped goes back to the queue.
  db.prepare("UPDATE tasks SET state = 'pending' WHERE run_id = ? AND step = ? AND state = 'running'").run(run, d.key);
  return stopped;
}

// ---- What the page shows.
export function progress(run: number) {
  const r = one('SELECT * FROM runs WHERE id = ?', run);
  const steps = DEFS.map((d, i) => {
    const s = step(run, d.key);
    const base: any = { key: d.key, title: d.title, index: i + 1, of: DEFS.length, state: s.state, error: s.error, doing: s.doing, startedAt: s.started_at, updatedAt: s.updated_at };
    if (!d.net) {
      const p = J(s.data).progress;
      const n = d.key === 'corpus' ? 1 : cameras(run).length;
      return { ...base, total: n, done: TERMINAL.has(s.state) ? n : p ? p.i - 1 : 0, failed: 0, group: p ? { label: d.grp, i: p.i, n: p.n, name: p.name, sub: p.sub } : null, summary: summary(run, d.key) };
    }
    const ts = all('SELECT id, grp, sub, state, error FROM tasks WHERE run_id = ? AND step = ? ORDER BY seq', run, d.key);
    const groups = [...new Set(ts.map((t) => t.grp))];
    const cur = ts.find((t) => t.state === 'running') || ts.find((t) => t.state === 'pending') || ts.at(-1);
    const inGrp = cur ? ts.filter((t) => t.grp === cur.grp) : [];
    return {
      ...base, total: ts.length, done: ts.filter((t) => t.state === 'done').length, failed: ts.filter((t) => t.state === 'failed').length,
      group: cur && d.grp ? { label: d.grp, i: groups.indexOf(cur.grp) + 1, n: groups.length, name: cur.grp, done: inGrp.filter((t) => t.state === 'done' || t.state === 'failed').length, total: inGrp.length, sub: cur.sub, subLabel: d.sub, subI: inGrp.indexOf(cur) + 1 } : cur ? { label: d.sub, i: ts.indexOf(cur) + 1, n: ts.length, name: cur.sub } : null,
      failures: ts.filter((t) => t.state === 'failed').slice(0, 30).map((t) => ({ where: [t.grp, t.sub].filter(Boolean).join(' › '), error: t.error })),
      summary: summary(run, d.key),
    };
  });
  // Each camera on each source: found, saved, not there, or failed (and why).
  const cell = new Map(all("SELECT step, id, state, error, out FROM tasks WHERE run_id = ? AND step IN ('locate', 'scrape')", run).map((t) => [`${t.step}|${t.id}`, t]));
  const coverage = cameras(run).map((c) => ({ id: c.id, name: c.name, cells: { ...Object.fromEntries(SOURCES.map((s) => {
    const l = cell.get(`locate|${c.id}|${s.key}`), sc = cell.get(`scrape|${c.id}|${s.key}`);
    const st = !l ? 'none' : l.state === 'failed' ? 'failed' : l.state !== 'done' ? 'waiting' : !J(l.out).url ? 'missing' : !sc ? 'waiting' : sc.state === 'done' ? 'saved' : sc.state === 'failed' ? 'failed' : 'waiting';
    return [s.key, { state: st, why: sc?.error || l?.error || J(l?.out).missing || '', url: J(l?.out).url || null }];
  })), ...Object.fromEntries((['front', 'back'] as const).map((side) => {
    const kept = one('SELECT url, width, height FROM pictures WHERE camera = ? AND side = ?', c.id, side);
    const t = cell.get(`images|${c.id}|${side}`) || one("SELECT state, error FROM tasks WHERE run_id = ? AND step = 'images' AND id = ?", run, `${c.id}|${side}`);
    const review = one("SELECT count(*) AS n FROM candidates WHERE camera = ? AND side = ? AND state = 'review'", c.id, side).n;
    const st = kept ? 'saved' : review ? 'waiting' : t?.state === 'failed' ? 'failed' : 'waiting';
    return [side, { state: st, why: kept ? `${kept.width}×${kept.height} · ${kept.url}` : review ? `${review} waiting for review` : t?.error || '', url: kept?.url || null }];
  })) } }));
  return { run: { id: r.id, createdAt: r.created_at, fresh: !!r.fresh, state: r.state, error: r.error, size: r.size }, steps, coverage };
}
function summary(run: number, key: string) {
  if (key === 'discover') { const o = outs(run, key); return `${o.reduce((n, t) => n + (t.out.items?.length || 0), 0)} listings on ${o.length} pages`; }
  if (key === 'corpus') { const d = data(run, key); return d.cameras ? `${d.cameras.length} cameras picked from ${d.candidates} models` : ''; }
  if (key === 'locate') { const o = outs(run, key); return `${o.filter((t) => t.out.url).length} pages found, ${o.filter((t) => !t.out.url).length} not on that source`; }
  if (key === 'scrape') { const o = outs(run, key), c = o.filter((t) => t.out.cached).length; return `${o.length} pages saved (${Math.round(o.reduce((n, t) => n + (t.out.chars || 0), 0) / 1000)}k characters)${c ? `, ${c} reused from the last ${CACHE_DAYS} days` : ''}`; }
  if (key === 'consensus') { const c = data(run, key).counts; return c ? `${c.verified || 0} verified, ${c.likely || 0} two sources, ${c.single || 0} one source, ${c.disputed || 0} disputed` : ''; }
  return '';
}
// The cameras with their facts, from the latest run that has any.
export function catalog() {
  const r = one('SELECT run_id AS id FROM facts ORDER BY run_id DESC LIMIT 1');
  if (!r) return { run: null, cameras: [] };
  const facts = all('SELECT camera, spec, fact FROM facts WHERE run_id = ?', r.id);
  return {
    run: r.id,
    cameras: cameras(r.id).map((c) => {
      const f: Record<string, any> = {};
      for (const x of facts) if (x.camera === c.id) f[x.spec] = J(x.fact);
      // The level from the facts as they stand, so a change to its scales needs no new fetch.
      delete f.level;
      const level = { id: c.id, ...levelOf(f) };
      return { id: c.id, name: c.name, brand: c.brand, rank: c.rank, info: c.info, level, facts: f, sources: pagesOf(r.id, c.id).map((p) => ({ source: p.source, title: SRC[p.source]?.title || p.source, url: p.url, scrapedAt: p.scraped_at })) };
    }),
  };
}
// The approved pictures: thumbnails for every camera, or one camera's full size.
export function pictures(id?: string) {
  const out: Record<string, Record<string, string | null>> = {};
  for (const r of all('SELECT * FROM pictures' + (id ? ' WHERE camera = ?' : ''), ...(id ? [id] : []))) (out[r.camera] ||= {})[r.side] = id ? dataUrl(r.file) : thumbUrl(r.thumb);
  return out;
}
export const reviewState = () => ({
  waiting: one("SELECT count(*) AS n FROM candidates WHERE state = 'review'").n as number,
  approved: one('SELECT count(*) AS n FROM pictures').n as number,
  rejected: one("SELECT count(*) AS n FROM candidates WHERE state = 'rejected'").n as number,
  run: setting('reviewRun', null),
});
export const dropped = () => new Set<string>(setting('dropped', []));
export const specList = () => DICT.filter((s) => !dropped().has(s.id)).map((s) => ({ id: s.id, label: s.label, group: s.group, kind: s.kind, tip: s.definition }));
