// Cambench as an MCP App: a database of cameras in the manner of 99spokes, built from every source
// read through Firecrawl, standardized to one set of specs and verified across independent sources.
// The page browses the cameras, shows one with every value's sources, compares several, and plots spec
// level against price; its Data tab runs the fetch (pipeline.ts) with a bar for every level.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import * as P from './pipeline.ts';
import { cambench } from './workflow.ts';
import * as R from './reads.ts';
import { NEED } from './consensus.ts';

const PAGE = 'ui://cambench/main';
const VERSION = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
const server = new McpServer({ name: 'cambench', version: VERSION });
// The workflow's tasks run here, in this container, where the database and pages are (inside Outpost only).
const flows = process.env.OUTPOST_WORKFLOWS_TOKEN ? cambench() : null;
const startRun = async (input: Record<string, unknown>) => {
  if (!flows) throw new Error('Runs start only inside Outpost.');
  return (await flows).start('cambench', input, { label: 'Cambench' });
};
const tool = (name: string, description: string, inputSchema: z.ZodRawShape, f: (a: any) => unknown, extra: { annotations?: any; _meta?: any } = {}) =>
  server.registerTool(name, { description, inputSchema, ...extra }, async (a: any) => {
    try {
      const r: any = await f(a || {});
      // MCP's structured content is an object: a list goes out as { items }.
      return { content: [{ type: 'text' as const, text: JSON.stringify(r) }], structuredContent: Array.isArray(r) ? { items: r } : r };
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: String(e?.message ?? e) }], isError: true };
    }
  });

// The list the page shows: each fact without its evidence (the camera's own view has that).
const lean = (f: any) => ({ value: f.value, text: f.text, status: f.status, owners: f.owners, conflicts: f.conflicts?.length || 0, items: f.items });
function view() {
  const r = P.latestRun(), c = P.catalog();
  return {
    version: VERSION,
    progress: r ? P.progress(r.id) : null,
    review: P.reviewState(),
    reading: R.queue(1).left,
    readTotal: (P.db.prepare('SELECT count(*) AS n FROM read_pages').get() as any).n + R.queue(1).left,
    busy: P.latestRun()?.state === 'running',
    need: NEED,
    specs: P.specList(),
    sources: P.SOURCES.map((s) => ({ key: s.key, title: s.title, owner: s.owner, trusted: s.trusted })),
    settings: { size: P.setting('size', 400), include: P.setting('include', []), exclude: P.setting('exclude', []) },
    cameras: c.cameras.map((x) => ({ ...x, facts: Object.fromEntries(Object.entries(x.facts).map(([k, f]) => [k, lean(f)])) })),
  };
}
const runId = () => {
  const r = P.latestRun();
  if (!r) throw new Error('Nothing fetched yet: Fetch from start first.');
  return r.id as number;
};

tool('cambench', 'Cambench: every camera with its standardized, source-verified specs and spec level, and the fetch\'s progress. Shows the Cambench page.', {}, () => view(), { annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: PAGE }, 'outpost/cacheSeconds': 0 } });
tool('progress', "The latest fetch's progress: every step, its tasks and the camera and source each is on.", {}, () => view(), { annotations: { readOnlyHint: true } });
tool('start_fetch', 'Fetch from start (fresh: true): a new run that reads every source anew. Resume previous fetch (fresh: false): the latest run goes on from the first step that stopped, keeping every finished step and its data; failed tasks are tried again.', { fresh: z.boolean() }, async (a) => {
  await startRun({ mode: a.fresh || !P.latestRun() ? 'fetch' : 'resume', fresh: !!a.fresh });
  return view();
});
tool('retry_failed', 'Retry: only the failed tasks are run again, then the steps made from them (extraction, verification) so they use the new results.', {}, async () => (runId(), await startRun({ mode: 'retry' }), view()));
tool('reprocess', 'Extract and verify again from the saved Markdown pages, without reading anything from the web (after the parsers change).', {}, async () => (runId(), await startRun({ mode: 'reprocess' }), view()));
tool('publish', 'Publish what Cambench has now to its site (the results and approved pictures), without fetching or reading anything.', {}, async () => (await startRun({ mode: 'publish' }), view()));
tool('set_corpus', 'Which cameras the next fetch covers: how many of the newest camera bodies on B&H, any type or sensor (size), names to add whatever their age (include), names to leave out (exclude).', {
  size: z.number().int().min(1).max(400).optional(), include: z.array(z.string()).optional(), exclude: z.array(z.string()).optional(),
}, (a) => {
  for (const k of ['size', 'include', 'exclude']) if (a[k] !== undefined) P.setSetting(k, a[k]);
  return view().settings;
});
tool('camera', 'One camera: every spec with its value, verification status, and each source\'s claim (the page, when it was scraped, the label and raw text it was read from), plus disagreeing claims.', { id: z.string() }, (a) => {
  const c = P.catalog().cameras.find((x) => x.id === a.id);
  if (!c) throw new Error(`No camera ${a.id}.`);
  return c;
}, { annotations: { readOnlyHint: true } });
tool('saved_page', "A saved page's Markdown, as it was scraped (front matter: url, source, camera, scraped_at).", { camera: z.string(), source: z.string(), offset: z.number().optional(), limit: z.number().optional() }, (a) => {
  const p = P.pagesOf(runId(), a.camera).find((x) => x.source === a.source);
  if (!p) throw new Error(`No saved ${a.source} page for ${a.camera}.`);
  const md = readFileSync(p.file, 'utf8');
  const off = a.offset || 0, lim = a.limit || 20_000;
  return { url: p.url, scrapedAt: p.scraped_at, chars: md.length, offset: off, text: md.slice(off, off + lim) };
}, { annotations: { readOnlyHint: true } });
// The reviewer sees each candidate as an image, with what it is meant to show.
server.registerTool('review_queue', { description: 'Cambench picture review: the next candidate pictures, each shown as an image on grey (grey is transparency), with its id, camera, side and size; and how many are left.', inputSchema: { limit: z.number().int().min(1).max(8).optional() }, annotations: { readOnlyHint: true } }, async (a: any) => {
  const q = P.reviewQueue(a?.limit || 6);
  if (!q.items.length) return { content: [{ type: 'text' as const, text: 'Nothing is left to review.' }] };
  const content: any[] = [{ type: 'text', text: `${q.left} waiting; here are ${q.items.length}.` }];
  for (const it of q.items) {
    content.push({ type: 'text', text: `Candidate ${it.id}: ${it.camera}, ${it.side} view wanted, ${it.size} px, from ${it.from}` });
    content.push({ type: 'image', data: readFileSync(it.look).toString('base64'), mimeType: 'image/jpeg' });
  }
  return { content };
});
tool('judge_picture', 'Cambench picture review: approve (ok: true) or reject a candidate picture by id, with a short reason.', { id: z.number().int(), ok: z.boolean(), why: z.string() }, (a) => P.judge(a.id, a.ok, a.why));
tool('review_prompt', 'What the page needs to start the picture-reviewing agent.', {}, () => ({ prompt: P.REVIEW_PROMPT, title: 'Cambench: review pictures', tools: 'app', model: 'sonnet', effort: 'low' }));
tool('save_review_run', "Remember the reviewing agent's run (or null when it is done).", { run: z.string().nullable() }, (a) => (P.setSetting('reviewRun', a.run), P.reviewState()));
tool('pictures', "The cut-out product pictures as PNG data: every camera's thumbnails, or one camera's full size (id).", { id: z.string().optional() }, (a) => P.pictures(a.id), { annotations: { readOnlyHint: true } });
// ---- Reading by agents (reads.ts): the queue of pages not yet read in their current form, a page's text,
// the standard each spec is written in, submitting what a page says (quoted), more sources, the gaps.
tool('read_queue', 'Pages no reader has read in their current form (a page read once is not queued again unless it changes). Optional camera id; part and of give one reader its share (pages whose id % of == part), so many read at once.', { limit: z.number().int().min(1).max(50).optional(), camera: z.string().optional(), part: z.number().int().min(0).optional(), of: z.number().int().min(1).optional() }, (a) => R.queue(a.limit || 5, a.camera, [], a.part || 0, a.of || 1), { annotations: { readOnlyHint: true } });
tool('read_page', "A saved page's text for reading (pictures and link targets removed), in chunks of up to 30,000 characters.", { page: z.number().int(), offset: z.number().int().optional() }, (a) => R.pageText(a.page, a.offset || 0), { annotations: { readOnlyHint: true } });
tool('add_source_page', "Add a page from another reputable site (a retailer's spec sheet, the maker's manual or spec page in another region, a review's spec table) for a camera: read through Firecrawl, checked to be this camera's own page, saved as that site's source. Returns its page id to read. Ruled-out sites (Digicamdb, Camera Decision, Versus, DXOMARK, PXLMAG) and marketplaces are refused.", { camera: z.string(), url: z.string().url() }, (a) => R.addPage(a.camera, a.url));
tool('gaps', 'What is not green yet: per camera, every value without three independent sources, with its value, who has it and who disagrees.', { camera: z.string().optional() }, (a) => R.gaps(a.camera), { annotations: { readOnlyHint: true } });
tool('reading_plan', "For the page: how many pages are left to read, and the next ones (leaving out those being read) with each reader agent's brief.", { busy: z.array(z.number().int()).optional(), limit: z.number().int().min(1).max(20).optional() }, (a) => {
  const q = R.queue(a.limit || 8, undefined, a.busy || []);
  return { left: q.left, next: q.pages.map((p: any) => ({ page: p.page, title: `Cambench: read ${p.name} (${p.source})`, prompt: R.readerPrompt(p) })) };
});
tool('spec_guide', 'Every spec to read: its id, its exact definition (what is measured, what is not), and the JSON its value takes.', {}, () => R.guide(), { annotations: { readOnlyHint: true } });
tool('submit_reads', "What one page says about the camera: for each spec it states, the value as JSON in spec_guide's form (in the page's own units), the exact words on the page that state it (quote; its figures as the page writes them; \"...\" between separate parts), and an optional note (another measure the page gives). Refused entries come back with the reason; submit again to correct. Replaces the page's earlier reading.", {
  page: z.number().int(), values: z.array(z.object({ spec: z.string(), value: z.any(), quote: z.string(), note: z.string().optional() })),
}, (a) => R.submit(a.page, a.values));
tool('conflicts', 'Disagreements to adjudicate: per camera and spec, the groups of differing values with each reading (page sha, owner, url, quote), and the spec definition.', { camera: z.string().optional() }, (a) => R.conflicts(a.camera), { annotations: { readOnlyHint: true } });
tool('judge_conflict', "An adjudicator's verdict on one disagreement (its camera, spec and key from conflicts): for each reading (by page sha), right, error (a typo, a copied or another model's figure) or other (another measure than the definition counts), with a short note.", {
  camera: z.string(), spec: z.string(), key: z.string(), verdicts: z.array(z.object({ sha: z.string(), verdict: z.enum(['right', 'error', 'other']), note: z.string().optional() })),
}, (a) => R.judge(a.camera, a.spec, a.key, a.verdicts));
tool('evaluate', "The run measured against the golden set (the Nikon Z5 IIC, Canon EOS R8 Mark II and Sony a7R VI, from the makers' own sheets): accuracy, every value that differs, and each camera's green count.", {}, () => R.evaluate(), { annotations: { readOnlyHint: true } });
tool('drop_specs', 'Remove specs from the atlas, only when Kevin asks.', { specs: z.array(z.string()) }, (a) => (P.setSetting('dropped', [...new Set([...P.setting('dropped', []), ...a.specs])]), { dropped: P.setting('dropped', []) }));
tool('spec_levels', "Every camera's spec level with its price and each area's score, weight and reason (for auditing the level).", {}, () => P.catalog().cameras.map((c: any) => ({
  id: c.id, name: c.name, price: c.facts.price_new?.value ?? c.facts.msrp?.value ?? null, level: c.level.level, coverage: c.level.coverage, missing: c.level.missing,
  reasons: c.level.reasons.map((r: any) => `${r.area} ${r.score}/100 ×${r.weight}: ${r.why}`),
})).sort((a: any, b: any) => (b.level ?? -1) - (a.level ?? -1)), { annotations: { readOnlyHint: true } });
tool('cameras', 'The corpus: camera ids and names.', {}, () => R.cameraIds(), { annotations: { readOnlyHint: true } });

server.registerResource('main', PAGE, { title: 'Cambench', mimeType: 'text/html;profile=mcp-app' }, async () => ({
  contents: [{ uri: PAGE, mimeType: 'text/html;profile=mcp-app', text: readFileSync(new URL('./page.html', import.meta.url), 'utf8') }],
}));

if (import.meta.main) {
  await server.connect(new StdioServerTransport());
  if (flows) void (await flows).serve('cambench', { slots: 4 });
}
