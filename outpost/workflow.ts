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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { workflows } from 'outpost-workflows';
import * as P from './pipeline.ts';
import * as R from './reads.ts';
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

// A picture as the site serves it: WebP, at most 1200 px wide, transparency kept (sharp: the Mac's FFmpeg has no
// WebP encoder).
export async function webp(file: string): Promise<string> {
  const data = await sharp(file).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  return data.toString('base64');
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
        const base64 = await webp(source);
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
      // Then the results: each camera's file in commits of about 2 MB (the engine takes at most 4 MB a message), and
      // last the index that names them, so the site never names a file that is not there yet.
      const files: Record<string, string>[] = [{}];
      size = 0;
      for (const [path, text] of Object.entries(file.cameraFiles as Record<string, string>)) {
        if (size + text.length > 2_000_000 && Object.keys(files.at(-1)!).length) (files.push({}), (size = 0));
        files.at(-1)![path] = text;
        size += text.length;
      }
      for (const [index, batch] of files.entries()) {
        if (!Object.keys(batch).length) continue;
        await context.log(`Results: camera files ${index + 1} of ${files.length}`);
        commit = (await context.publish({ repo: REPOSITORY, files: batch, message: 'Update camera results' })).commit ?? commit;
      }
      const published = await context.publish({
        repo: REPOSITORY,
        files: { 'results/cambench.json': `${JSON.stringify(file.index, null, 2)}\n` },
        message: 'Update results',
      });
      commit = published.commit ?? commit;
      return { commit, summary: commit ? `Published ${commit.slice(0, 7)}` : 'Nothing changed' };
    },
  });

  // ---- The agents' part, as tasks: each agent gets what it needs in its brief and answers in JSON; the worker
  // checks and saves it (no tools of the app's own).
  const json = (report: string, open = '[', close = ']') => {
    const a = report.indexOf(open), b = report.lastIndexOf(close);
    if (a < 0 || b < a) throw new Error(`the agent answered without JSON: ${report.slice(0, 200)}`);
    return JSON.parse(report.slice(a, b + 1));
  };
  const guide = () => JSON.stringify(R.guide());

  // One page read against the spec guide: what it states about the camera, each with the words that state it.
  const readTask = task<{ page: number; name: string; camera: string; source: string; url: string }, { accepted: number; summary: string }>({
    name: 'read',
    timeout: '30m',
    retries: 1,
    concurrency: { key: 'reader', max: 6 },
    fn: async (p, context) => {
      let text = '';
      for (let offset = 0; ; offset += 30000) {
        const chunk = R.pageText(p.page, offset);
        text += chunk.text;
        if (!chunk.more) break;
      }
      const brief = (extra: string) => `Read one saved web page about the ${p.name} (${p.camera}) and record exactly what it says, for Cambench, a camera spec database. Page: ${p.source}, ${p.url}.
For every spec the page states about the ${p.name} body itself, give its value as JSON exactly as the spec guide gives it, in the units the page uses ({"n": 24.66, "unit": "oz"} is fine), and the exact words on the page that state it (its figures as the page writes them, "..." between separate parts). Follow each definition exactly: a figure for a different measure is not that spec's value (mention it in "note" or leave it out). Only this camera, never another model the page compares or mentions, nor lenses, accessories or kits. An absence (false, "None", "No") only where the page says so, never from silence.
Reply with only a JSON array: [{"spec": "<id>", "value": <json>, "quote": "<words>", "note": "<optional>"}], or [] when the page says nothing about this camera.${extra}

The spec guide:
${guide()}

The page:
${text}`;
      const title = `Cambench: read ${p.name} (${p.source})`;
      let values = json(await context.agent({ prompt: brief(''), title, model: 'sonnet', effort: 'low' }));
      let out = R.submit(p.page, values);
      if (out.refused.length) {
        const again = `\n\nYour last answer was ${JSON.stringify(values)}; these entries were refused: ${JSON.stringify(out.refused)}. Fix them and give every value again.`;
        values = json(await context.agent({ prompt: brief(again), title, model: 'sonnet', effort: 'low' }));
        out = R.submit(p.page, values);
      }
      return { accepted: out.accepted, summary: `${out.accepted} values${out.refused.length ? `, ${out.refused.length} refused` : ''}` };
    },
  });

  // One disagreement between sources settled: each reading right, an error, or another measure than the definition.
  const adjudicateTask = task<{ item: any }, { summary: string }>({
    name: 'adjudicate',
    timeout: '20m',
    retries: 1,
    concurrency: { key: 'reader', max: 6 },
    fn: async ({ item }, context) => {
      const prompt = `Sources disagree about the ${item.name}'s ${item.spec}. The definition: ${item.definition}
The readings, grouped by value: ${JSON.stringify(item.groups)}
For each reading (by its sha), decide: right (it states this spec as defined), error (a typo, a copied figure, another model's figure) or other (another measure than the definition counts). Look at the pages if it helps.
Reply with only a JSON array: [{"sha": "<sha>", "verdict": "right" | "error" | "other", "note": "<short reason>"}].`;
      const verdicts = json(await context.agent({ prompt, title: `Cambench: ${item.name} ${item.spec}`, model: 'sonnet', effort: 'low' }));
      R.judge(item.camera, item.spec, item.key, verdicts);
      return { summary: `${verdicts.length} readings judged` };
    },
  });

  // Candidate product pictures approved or rejected, a few at a time, until none wait.
  const reviewTask = task<{ batch: number }, { judged: number; summary: string }>({
    name: 'review',
    timeout: '30m',
    retries: 1,
    fn: async (_input, context) => {
      const q = P.reviewQueue(6);
      if (!q.items.length) return { judged: 0, summary: 'Nothing to review' };
      const prompt = `${P.REVIEW_PROMPT.split('Call review_queue')[0]}Look at each candidate picture (open the file; grey is where it is transparent) and decide.
${q.items.map((it: any) => `Candidate ${it.id}: ${it.camera}, ${it.side} view wanted, ${it.size} px, from ${it.from}; the file: ${it.look}`).join('\n')}
Reply with only a JSON array: [{"id": <id>, "ok": true | false, "why": "<short reason>"}].`;
      const verdicts = json(await context.agent({ prompt, title: 'Cambench: review pictures', model: 'sonnet', effort: 'low' }));
      for (const v of verdicts) P.judge(Number(v.id), !!v.ok, String(v.why || ''));
      return { judged: verdicts.length, summary: `${verdicts.length} pictures judged, ${q.left - verdicts.length} left` };
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
        ...steps.flatMap((d) => [
          { key: d.key, label: d.title, kind: 'step' },
          ...(d.key === 'scrape' ? [{ key: 'read', label: 'Read every page', kind: 'read' }, { key: 'adjudicate', label: 'Settle disagreements', kind: 'adjudicate' }] : []),
          ...(d.key === 'images' ? [{ key: 'review', label: 'Review pictures', kind: 'review' }] : []),
        ]),
        { key: 'export', label: 'Export results', kind: 'export' },
        { key: 'publish', label: 'Publish', kind: 'publish' },
      ]);
      const states: string[] = [];
      for (const d of steps) {
        states.push((await stepTask.run({ run: id, key: d.key }, { label: d.title, key: d.key })).state);
        if (d.key === 'scrape') {
          // Every page not read in its current form, each by its own reader; then each disagreement settled.
          const pages = R.queue(100000).pages;
          await Promise.all(pages.map((p: any) => readTask.run(p, { label: `Read ${p.name} (${p.source})`, key: 'read' }).catch(() => null)));
          const disputed = R.conflicts().items;
          await Promise.all(disputed.map((item: any) => adjudicateTask.run({ item }, { label: `${item.name}: ${item.spec}`, key: 'adjudicate' }).catch(() => null)));
        }
        if (d.key === 'images')
          for (let batch = 0; batch < 200 && P.reviewQueue(1).items.length; batch++)
            if (!(await reviewTask.run({ batch }, { label: `Review pictures ${batch + 1}`, key: 'review' })).judged) break;
      }
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
