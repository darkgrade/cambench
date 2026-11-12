// Cambench as a workflow (Outpost's workflows), served from the app's own container in Outpost, where its
// database, saved pages and pictures live (only what the site shows goes to GitHub). One run:
//
//   cambench ─┬─ discover    B&H's listing, newest camera bodies first
//             ├─ corpus      the cameras this run covers
//             ├─ locate      each camera on each source
//             ├─ scrape      each page found, kept as Markdown (a page fetched in the last month is reused)
//             ├─ consensus   what readers recorded, verified across independent sources, and spec levels
//             ├─ images      product pictures cut out
//             ├─ export      results/cambench.json and the approved pictures, sized for the web
//             └─ publish     those files to GitHub (the site redeploys from them)
//
// Each step is the pipeline's own (pipeline.ts keeps every task and its output in SQLite): a stopped run goes
// on where it stopped, and only failed tasks are redone.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { workflows } from 'outpost-workflows';
import * as P from './pipeline.ts';
import { NEED } from './consensus.ts';

const REPOSITORY = 'darkgrade/cambench';
// publish: only export and publish what is there now (no step runs, nothing is fetched).
type Mode = 'fetch' | 'resume' | 'retry' | 'reprocess' | 'publish';
type RunInput = { mode?: Mode; fresh?: boolean; force?: boolean };
type StepInput = { run: number; key: string };
type StepOutput = { state: string; summary: string };

// The site's data: every camera with its level, price, standardized specs (value, status, who agrees) and
// pictures. Evidence (pages, quotes) stays here.
export function results() {
  const { run, cameras } = P.catalog();
  const pictures = new Map<string, Record<string, string>>();
  // CAMBENCH_DATA: where the app's data folder (/data in its container) is, when exporting outside it.
  const local = (file: string) => (process.env.CAMBENCH_DATA ? file.replace(/^\/data(?=\/)/, process.env.CAMBENCH_DATA) : file);
  for (const row of (P.db.prepare('SELECT camera, side, file FROM pictures').all() as { camera: string; side: string; file: string }[]).map((r) => ({ ...r, file: local(r.file) })))
    if (existsSync(row.file)) (pictures.get(row.camera) || pictures.set(row.camera, {}).get(row.camera)!)[row.side] = row.file;
  const slug = (id: string) => id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const images: Record<string, string> = {};
  const rows = cameras.map((camera: any) => {
    const files = pictures.get(camera.id) || {};
    const image: Record<string, string> = {};
    for (const [side, file] of Object.entries(files)) {
      const path = `public/cameras/${slug(camera.id)}-${side}.webp`;
      images[path] = file;
      image[side] = path.replace(/^public\//, '');
    }
    // Each fact as the app shows it: its value, who agrees, and each source's evidence (the page's link, when it
    // was scraped, and what it was read from): never a page's full text.
    const evidence = (list: any[] = []) => list.map((e) => ({ source: e.source, owner: e.owner, url: e.url, at: e.at, label: e.label, raw: String(e.raw ?? ''), value: e.value ?? null }));
    const facts = Object.fromEntries(
      Object.entries(camera.facts as Record<string, any>)
        .filter(([key]) => !key.startsWith('image_'))
        .map(([key, fact]) => [
          key,
          {
            value: fact.value ?? null,
            text: fact.text ?? null,
            status: fact.status,
            owners: fact.owners || [],
            evidence: evidence(fact.evidence),
            conflicts: evidence(fact.conflicts),
            ...(fact.items ? { items: fact.items.map((item: any) => ({ text: item.text, status: item.status, owners: item.owners || [] })) } : {}),
          },
        ]),
    );
    return {
      id: camera.id,
      slug: slug(camera.id),
      name: camera.name,
      brand: camera.brand,
      rank: camera.rank,
      price: camera.facts.price_new?.value ?? camera.facts.msrp?.value ?? camera.info?.price ?? null,
      features: camera.info?.features || [],
      level: camera.level,
      image,
      facts,
      // Every page read for this camera: where, and when it was scraped (its text stays in Outpost).
      sources: (camera.sources || []).map((source: any) => ({ source: source.source, title: source.title, url: source.url, scrapedAt: source.scrapedAt })),
    };
  });
  // The overview's index: what the list, filters and chart show for each camera; each camera's page reads its
  // own file (results/cameras/<slug>.json) with every spec and the level's reasons.
  const LISTED = ['sensor', 'mp', 'mount', 'type', 'burst', 'ibis', 'announced'];
  const index = {
    benchmark: 'cambench',
    version: 1,
    date: new Date().toISOString(),
    run: run ? { id: run.id, createdAt: run.created_at } : null,
    // Independent sources that make a value verified (green).
    need: NEED,
    specs: P.specList(),
    sources: P.SOURCES.map((s) => ({ key: s.key, title: s.title, owner: s.owner, trusted: s.trusted })),
    method: {
      sources: "Every camera body B&H lists new, newest first. Each is looked up on the maker's own site and press release, B&H, DPReview, Adorama, Crutchfield, Wex, launch news, Wikipedia, MPB and eBay, and every page is kept as it was read.",
      reading: 'Agents read each page against one dictionary of about 45 specs, quoting the words that state each value; a reading is kept only when its quote is on the page and its figures match.',
      verification: "A value is verified when independent sources (different owners: two sites of one company count once) agree; disagreements are adjudicated against each spec's definition.",
      level: 'A 0–100 spec level from fixed scales per area (resolution, video, burst, viewfinder, stabilization, card slots, build and battery, autofocus, screen), weighted, with a reason per area.',
    },
    cameras: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      rank: row.rank,
      price: row.price,
      level: row.level?.level ?? null,
      coverage: row.level?.coverage ?? null,
      image: row.image,
      specs: Object.fromEntries(LISTED.filter((key) => row.facts[key]).map((key) => [key, { value: row.facts[key].value, text: row.facts[key].text }])),
    })),
  };
  const cameraFiles = Object.fromEntries(
    rows.map((row) => [
      `results/cameras/${row.slug}.json`,
      `${JSON.stringify(row)}\n`,
    ]),
  );
  const file = { index, cameraFiles, cameras: rows };
  return { file, images };
}

// A picture as the site serves it: WebP, at most 1200 px wide, transparency kept.
// (Written to a file: WebP's header holds its size, which ffmpeg can only fill in on a seekable output.)
export function webp(file: string): string {
  const out = join(mkdtempSync(join(tmpdir(), 'cambench-')), 'picture.webp');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', "scale='min(1200,iw)':-2", '-c:v', 'libwebp', '-quality', '82', out]);
  const data = readFileSync(out).toString('base64');
  rmSync(dirname(out), { recursive: true, force: true });
  return data;
}

export async function cambench() {
  const { task, serve, start } = await workflows('cambench');

  const stepTask = task<StepInput, StepOutput>({
    name: 'step',
    timeout: '12h',
    retries: 1,
    fn: async (input, context) => {
      // What the step is doing now, into the run's log while it works.
      let last = '';
      const timer = setInterval(() => {
        const now = P.doing(input.run, input.key);
        if (now && now !== last) void context.log((last = now));
      }, 2000);
      try {
        const { state, error } = await P.runStep(input.run, input.key);
        if (state === 'failed') throw new Error(error || 'failed');
        return { state, summary: state === 'partial' ? `Partly done: ${error}` : state === 'skipped' ? (error ?? 'skipped') : 'Done' };
      } finally {
        clearInterval(timer);
      }
    },
  });

  const exportTask = task<{ run: number }, { cameras: number; pictures: number; summary: string }>({
    name: 'export',
    fn: async () => {
      const { file, images } = results();
      return { cameras: file.cameras.length, pictures: Object.keys(images).length, summary: `${file.cameras.length} cameras, ${Object.keys(images).length} pictures` };
    },
  });

  const publishTask = task<{ run: number }, { commit: string | null; summary: string }>({
    name: 'publish',
    timeout: '30m',
    fn: async (_input, context) => {
      const { file, images } = results();
      if (!context.inOutpost) return { commit: null, summary: 'Not in Outpost, so not published' };
      // Pictures first, in commits of about 2 MB (a task's input has a size limit), then the results that
      // point at them, so the site never names a picture that is not there yet.
      const batches: Record<string, { base64: string }>[] = [{}];
      let size = 0;
      for (const [path, source] of Object.entries(images)) {
        const base64 = webp(source);
        if (size + base64.length > 2_000_000 && Object.keys(batches.at(-1)!).length) (batches.push({}), (size = 0));
        batches.at(-1)![path] = { base64 };
        size += base64.length;
      }
      let commit: string | null = null;
      for (const [index, batch] of batches.entries()) {
        if (!Object.keys(batch).length) continue;
        await context.log(`Pictures ${index + 1} of ${batches.length}`);
        commit = (await context.publish({ repo: REPOSITORY, files: batch, message: 'Update camera pictures' })).commit ?? commit;
      }
      const published = await context.publish({
        repo: REPOSITORY,
        files: { ...file.cameraFiles, 'results/cambench.json': `${JSON.stringify(file.index, null, 2)}\n` },
        message: 'Update results',
      });
      commit = published.commit ?? commit;
      return { commit, summary: commit ? `Published ${commit.slice(0, 7)}` : 'Nothing changed' };
    },
  });

  const run = task<RunInput, { run: number; summary: string }>({
    name: 'cambench',
    timeout: '72h',
    fn: async (input, context) => {
      const latest = P.latestRun();
      const mode: Mode = input.mode ?? (input.force || input.fresh || !latest ? 'fetch' : 'resume');
      const id = mode === 'fetch' ? P.newRun(!!(input.fresh || input.force)) : (latest!.id as number);
      if (mode !== 'fetch' && mode !== 'publish') P.prepare(id, mode);
      const steps = mode === 'publish' ? [] : P.DEFS;
      await context.plan([
        ...steps.map((d) => ({ key: d.key, label: d.title, kind: 'step' })),
        { key: 'export', label: 'Export results', kind: 'export' },
        { key: 'publish', label: 'Publish', kind: 'publish' },
      ]);
      const states: string[] = [];
      for (const d of steps) states.push((await stepTask.run({ run: id, key: d.key }, { label: d.title, key: d.key })).state);
      if (steps.length) P.finishRun(id);
      const exported = await exportTask.run({ run: id }, { label: 'Export results', key: 'export' });
      const published = await publishTask.run({ run: id }, { label: 'Publish', key: 'publish' });
      const partly = states.filter((s) => s !== 'done').length;
      return { run: id, summary: `${exported.summary}${partly ? ` · ${partly} steps partly done` : ''} · ${published.summary}` };
    },
  });
  void run;

  return { serve, start };
}
