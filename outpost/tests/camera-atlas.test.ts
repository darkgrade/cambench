// Camera Atlas against a stand-in for Outpost's gateway with Firecrawl's two tools. A run discovers
// cameras from two listing pages, locates and scrapes each source, and verifies values across them;
// Firecrawl signing out mid-run stops it, and Resume finishes it without reading anything twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stdio } from '../../../../tests/stdio.ts';
import { cameraKey, flatSpecs } from '../specs.ts';
import { names, listingUrl, bhPictures } from '../pipeline.ts';
import { cutout, candidate } from '../images.ts';

const BH = readFileSync(new URL('./fixtures/bh-a7v.md', import.meta.url), 'utf8');
const ADORAMA = readFileSync(new URL('./fixtures/adorama-r8ii.txt', import.meta.url), 'utf8');

test("Adorama's archived plain text is saved as a Markdown spec sheet", () => {
  const md = flatSpecs(ADORAMA);
  assert.match(md, /### Viewfinder[\s\S]*\| Dot count \| Approx\. 2,360,000 dots \|/);
  assert.match(md, /\| Weight \| Approx\. 19\.26 oz \(546g\) \(Including battery and card\)<br>Body only: Approx\. 17\.60 oz \(499g\) \|/);
});

test('a camera is one name, however a listing or a maker writes it', () => {
  for (const n of ['Canon EOS R8 Mark II', 'Canon R8 Mk II', 'Canon R8 Mk.II', 'Canon EOS R8MkII']) assert.equal(cameraKey(n), 'canon:r8ii');
  assert.equal(cameraKey('Sony ILCE-7M5'), cameraKey('Sony a7 V Mirrorless Camera'));
  assert.equal(cameraKey('Panasonic Lumix DC-S1RM2'), cameraKey('Panasonic LUMIX S1R II'));
  assert.equal(cameraKey('Panasonic DC-S1M2ES'), cameraKey('Panasonic Lumix S1 IIE'), 'a maker model code is the camera');
  assert.equal(cameraKey('Panasonic DC-S5M2X'), cameraKey('Panasonic Lumix S5 IIX'));
  assert.notEqual(cameraKey('Sony a7 V'), cameraKey('Sony a7 VI'));
  // Kits, colours and firmware editions are the one camera.
  for (const n of ['Nikon Z5 IIC Mirrorless Camera with Essentials+ Kit (Silver)', 'Nikon Z5 IIC Mirrorless Camera and Basic Bundle (Black)', 'Nikon Z5 IIC Mirrorless Camera with 40mm f/2 Lens Kit (Silver)']) assert.equal(cameraKey(n), 'nikon:z5iic');
  assert.equal(cameraKey('Canon EOS R6 Mark III Mirrorless Camera with Cropping Guide Firmware'), 'canon:r6iii');
  // A comparison page or another brand's camera is never this camera's page.
  assert.equal(names('Panasonic FP2 vs Sigma DP2 Merrill', 'sigma:fp2', 'Sigma'), false);
  assert.equal(names('Panasonic Lumix DMC-FP2 specs', 'sigma:fp2', 'Sigma'), false);
  assert.equal(names('Sigma FP2 Specifications', 'sigma:fp2', 'Sigma'), true);
});

test('only a transparent picture is used: the camera kept, a badge beside it dropped; an opaque one never', () => {
  const w = 200, h = 150, px = Buffer.alloc(w * h * 4, 0);
  const fill = (x0: number, y0: number, x1: number, y1: number, v: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.fill(v, (y * w + x) * 4, (y * w + x) * 4 + 3), (px[(y * w + x) * 4 + 3] = 255); };
  fill(60, 40, 180, 130, 20); // the camera
  fill(5, 5, 30, 25, 200); // a badge in the corner
  const c = cutout(w, h, px)!;
  assert.deepEqual(c.box, { x: 60, y: 40, w: 120, h: 90 });
  assert.equal(c.px[(10 * w + 10) * 4 + 3], 0, 'the badge is gone');
  const white = Buffer.alloc(w * h * 4, 255);
  for (let y = 40; y < 130; y++) white.fill(20, (y * w + 60) * 4, (y * w + 180) * 4);
  assert.equal(cutout(w, h, white), null, 'a camera on white is never cut out');
});

// A transparent 2,000 px product shot: a dark body on nothing.
// The picture tests make their images with ffmpeg (the sandbox has it); where it is missing they say so and skip.
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0 || 'ffmpeg is not installed here';
const PNG = ffmpeg !== true ? Buffer.alloc(0) : (() => {
  const w = 1010, h = 500, px = Buffer.alloc(w * h * 4);
  for (let y = 100; y < 400; y++) for (let x = 120; x < 890; x++) px.writeUInt32BE(0x202020ff, (y * w + x) * 4);
  return execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], { input: px });
})();

test("B&H's pictures: front and back read from its listing data, the white backdrop and an eyelet hole cleared", { skip: ffmpeg !== true && ffmpeg }, () => {
  const raw = `<div data-data="{&quot;imageInfo&quot;:{&quot;images&quot;:[{&quot;isKitHeader&quot;:false,&quot;note&quot;:&quot;Canon EOS R8 Mark II&quot;,&quot;images&quot;:[{&quot;detail&quot;:{&quot;url&quot;:&quot;https://www.bhphotovideo.com/images/images500x500/canon_r8_1789505141_2001101.jpg&quot;}},{&quot;detail&quot;:{&quot;url&quot;:&quot;https://static.bhphoto.com/images/multiple_images/images500x500/1789505210_IMG_2830216.jpg&quot;}}]}]}}"></div>`;
  const p = bhPictures(raw)['2001101'];
  assert.match(p.front[0], /images2500x2500\/canon_r8_1789505141_2001101\.jpg$/);
  assert.match(p.back[0], /multiple_images\/images1500x1500\/1789505210_IMG_2830216\.jpg$/);
  // A body on pure white, with a strap eyelet's hole through it; and a photo on grey.
  const w = 1200, h = 900, white = Buffer.alloc(w * h * 3, 255), grey = Buffer.alloc(w * h * 3, 120);
  for (let y = 200; y < 700; y++) for (let x = 150; x < 1050; x++) white.fill(25, (y * w + x) * 3, (y * w + x) * 3 + 3);
  for (let y = 260; y < 290; y++) for (let x = 170; x < 200; x++) white.fill(255, (y * w + x) * 3, (y * w + x) * 3 + 3);
  const jpg = (px: Buffer) => execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', '-frames:v', '1', '-q:v', '2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'], { input: px });
  // Served as files: the checker downloads synchronously, so a server in this process could never answer.
  const dir = mkdtempSync(join(tmpdir(), 'bh-')), at = `file://${dir}`;
  writeFileSync(join(dir, 'front.jpg'), jpg(white));
  writeFileSync(join(dir, 'grey.jpg'), jpg(grey));
  {
    const c = candidate([`${at}/missing-2500.jpg`, `${at}/front.jpg`], dir, 'r8-front', true) as any;
    assert.equal(c.url, `${at}/front.jpg`, 'the first size that exists');
    assert.deepEqual([c.width, c.height], [1200, 900]);
    const px = execFileSync('ffmpeg', ['-v', 'error', '-i', c.file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 });
    const alpha = (x: number, y: number) => px[(y * 1600 + x) * 4 + 3];
    assert.equal(alpha(5, 5), 0, 'the backdrop is clear');
    assert.equal(alpha(800, 600), 255, 'the body is solid');
    assert.ok('reject' in (candidate(`${at}/grey.jpg`, dir, 'grey', true) as any), 'a picture not on pure white is refused');
    // The eyelet: the white hole through the body is clear too. Find it on the fitted canvas.
    const cut = cutout(1600, 1200, px)!;
    let holes = 0;
    for (let y = cut.box.y + 5; y < cut.box.y + cut.box.h - 5; y++) for (let x = cut.box.x + 5; x < cut.box.x + cut.box.w - 5; x++) if (alpha(x, y) === 0) holes++;
    assert.ok(holes > 200, 'the eyelet hole is see-through');
  }
});

// B&H's main picture of the a7 V, at its image host's full size: a dark body on pure white.
const BH_FRONT = '/images2500x2500/sony_a7v_1789000000_1935439.jpg';
const WHITE = ffmpeg !== true ? Buffer.alloc(0) : (() => {
  const w = 1010, h = 560, px = Buffer.alloc(w * h * 3, 255);
  for (let y = 120; y < 440; y++) for (let x = 120; x < 890; x++) px.fill(30, (y * w + x) * 3, (y * w + x) * 3 + 3);
  return execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', '-frames:v', '1', '-q:v', '2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'], { input: px });
})();

const listing = (items: Array<[string, number, string]>, last: number) =>
  `# Mirrorless Cameras\n\n${items.map(([t, n, f]) => `### [${t}](https://www.bhphotovideo.com/c/product/${n}-REG/x.html)\n\nKey Features\n\n- ${f}\n\nShow More\n\n$1,99900\n\n[Usedfrom$1,700.00](https://www.bhphotovideo.com/c/used/${n}/x.html)\n`).join('\n')}\n- [${last}](https://www.bhphotovideo.com/c/buy/Mirrorless-System-Cameras/ci/16158/N/4288586280/pn/${last}?sort=NEWEST&filters=fct_bodies-kits_4023%3Abody-only%3AREGULAR)\n`;
const dpr = `# Sony a7 V\n\n## Quick specs\n\nBody TypeSLR-style mirrorless\n\nEffective pixels33 megapixels\n\nLens MountSony E\n\nLCD dots2090000 dots\n\nWeight695 g\n\nBattery life CIPA (LCD)630\n\n| Sensor size | Full frame (35.9 x 23.9 mm) |\n| --- | --- |\n| Max resolution | 7008 x 4672 |\n| Announced | Dec 2, 2025 |\n| MSRP | $2,899 (body only) |\n| Video resolution | 3840 x 2160 @ 120p / 60p / 30p / 24p, 1920 x 1080 @ 60p |\n${' '.repeat(200)}`;
const dcd = `# Sony A7 V specs\n\n| Lens mount | Sony E-mount |\n| --- | --- |\n| Megapixels | 33.0 MP |\n| Weight | 695 g (incl. battery) |\n| Announced | December 2025 |\n| MSRP | $2899 |\n| Movie | 4K/120p, Full HD 60p |\n| Sensor | Full Frame CMOS |\n${' '.repeat(200)}`;

test('a run discovers, scrapes, verifies; a sign-out stops it and Resume finishes it', { skip: ffmpeg !== true && ffmpeg }, async () => {
  let signedIn = true, signedOut = false;
  const scraped: string[] = [], searches: string[] = [], served: string[] = [];
  let base = '';
  const pages: Record<string, string> = {
    [listingUrl(1)]: listing([['Sony a7 V Mirrorless Camera', 1935439, '33MP Partially-Stacked Exmor RS Full-Frame Sensor'], ['Sigma fp Mirrorless Camera (Refurbished)', 1987454, 'Full-Frame']], 3),
    [listingUrl(2)]: listing([['Nikon Z5 II Mirrorless Camera', 1889823, '24.5MP FX-Format CMOS Sensor'], ['Nikon Z5 II Mirrorless Camera (Silver)', 1956181, 'Full-Frame']], 3),
    [listingUrl(3)]: listing([['Nikon Zf Mirrorless Camera', 1918830, 'Full-Frame']], 3),
    'https://www.bhphotovideo.com/c/product/1935439-REG/x.html/specs': BH,
    'https://www.dpreview.com/products/sony/slrs/sony_a7v/specifications': dpr,
    'https://en.wikipedia.org/wiki/Sony_a7_V': dcd,
    'https://www.ebay.com/sch/i.html?_nkw=Sony+a7+V+body&_sacat=31388&LH_ItemCondition=3000&LH_BIN=1&_ipg=60&rt=nc': `## Results\n\n- [Sony a7 V Mirrorless Camera BodyOpens in a new window or tab](https://www.ebay.com/itm/111111111111)\n\nPre-Owned\n\n$2,400.00\n\n- [Sony a7 V Body ExcellentOpens in a new window or tab](https://www.ebay.com/itm/222222222222)\n\nPre-Owned\n\n$2,600.00\n\n- [Sony a7 IV BodyOpens in a new window or tab](https://www.ebay.com/itm/333333333333)\n\nPre-Owned\n\n$1,500.00\n${' '.repeat(200)}`,
  };
  const answers: Record<string, (a: any) => any> = {
    'firecrawl-me__firecrawl_scrape': (a) => {
      if (!signedIn) throw new Error('Unauthorized');
      if (a.alexandria) {
        assert.equal(a.alexandria.options.url, 'https://www.adorama.com/sony-a7-v-mirrorless-camera-body/p/isoa7v');
        if (a.alexandria.capability === 'captures/history') return { data: { alexandria: [{ data: { captures: [{ timestamp: '20260101000000', status: 200 }, { timestamp: '20261020101500', status: 200, archive_url: 'https://web.archive.org/web/20261020101500/x' }] } }] } };
        return { data: { alexandria: [{ data: { actual_timestamp: a.alexandria.options.timestamp, archive_url: `https://web.archive.org/web/${a.alexandria.options.timestamp}/https://www.adorama.com/sony-a7-v-mirrorless-camera-body/p/isoa7v`, text: 'Sony a7 V Specifications\nGeneral\nJump to...\nLens mount\nSony E-mount\nImage sensor\nFull-frame Exmor RS CMOS\nEffective pixels\nApprox. 33.0 megapixels\nWeight\nApprox. 695 g (with battery and card)\nBattery\nNP-FZ100\nAccessories for' } }] } };
      }
      scraped.push(a.url);
      const md = pages[a.url] ?? (a.url.includes('Nikon') || a.url.includes('1889823') ? `# Nikon Z5II\n\n| Lens Mount | Nikon Z |\n| --- | --- |\n${' '.repeat(200)}` : null);
      if (md == null) throw new Error('HTTP 404');
      // B&H's listing carries each product's picture data in its markup.
      const rawHtml = a.url === listingUrl(1) ? `<div data-data="{&quot;imageInfo&quot;:{&quot;images&quot;:[{&quot;isKitHeader&quot;:false,&quot;note&quot;:&quot;Sony a7 V&quot;,&quot;images&quot;:[{&quot;detail&quot;:{&quot;url&quot;:&quot;https://www.bhphotovideo.com/images/images500x500/sony_a7v_1789000000_1935439.jpg&quot;}}]}]}}"></div>` : '';
      return { markdown: md, rawHtml, metadata: { title: 'page', statusCode: 200 } };
    },
    'firecrawl-me__firecrawl_search': (a) => {
      if (a.sources?.[0] === 'images') {
        searches.push(a.query);
        return /a7 V" front/.test(a.query) ? { data: { images: [{ title: 'Sony a7 V Mirrorless Camera Body', imageUrl: `${base}/a7v-front.png?width=500`, url: 'https://shop.example/a7v' }, { title: 'Sony a7 V with 28-70mm Lens', imageUrl: `${base}/kit.png`, url: 'https://shop.example/kit' }] } } : { data: { images: [] } };
      }
      const d = a.includeDomains?.[0] || '';
      const sony = /a7 V/.test(a.query);
      if (d === 'adorama.com' && sony) return { data: { web: [{ url: 'https://www.adorama.com/sony-a7-v-mirrorless-camera-body/p/isoa7v', title: 'Sony a7 V Mirrorless Camera Body' }] } };
      if (d === 'en.wikipedia.org' && sony) { if (!signedOut) (signedOut = true), (signedIn = false); return { data: { web: [{ url: 'https://en.wikipedia.org/wiki/Sony_a7_V_vs_a7_IV', title: 'Sony a7 V vs a7 IV' }, { url: 'https://en.wikipedia.org/wiki/Sony_a7_V', title: 'Sony a7 V - Wikipedia' }] } }; }
      if (d === 'dpreview.com' && sony) return { data: { web: [{ url: 'https://www.dpreview.com/products/sony/slrs/sony_a7vi', title: 'Sony a7 VI' }, { url: 'https://www.dpreview.com/products/sony/slrs/sony_a7v', title: 'Sony a7 V: Digital Photography Review' }] } };
      return { data: { web: [] } };
    },
  };
  const tools = Object.keys(answers).map((name) => ({ name, inputSchema: { type: 'object' } }));
  const gw = createServer(async (req, res) => {
    if (req.method === 'GET') {
      served.push(req.url!);
      if (req.url === BH_FRONT) return res.end(WHITE);
      return res.end(req.url === '/a7v-front.png' ? PNG : '');
    }
    let body = '';
    for await (const d of req) body += d;
    const m = JSON.parse(body);
    let result: any;
    if (m.method === 'tools/list') result = { tools };
    else try { result = { content: [{ type: 'text', text: JSON.stringify(answers[m.params.name](m.params.arguments || {})) }] }; } catch (e: any) { result = { isError: true, content: [{ type: 'text', text: e.message }] }; }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
  });
  await new Promise<void>((r) => gw.listen(0, r));
  base = `http://127.0.0.1:${(gw.address() as any).port}`;
  const dir = mkdtempSync(join(tmpdir(), 'ca-'));
  const server = stdio(new URL('../server.ts', import.meta.url).pathname, { CAMERA_ATLAS_BH_IMAGES: base, CAMERA_ATLAS_SIZE: '2', CAMERA_ATLAS_DB: join(dir, 'ca.db'), CAMERA_ATLAS_RETRY_MS: '1', OUTPOST_MCP_URL: `http://localhost:${(gw.address() as any).port}/mcp`, OUTPOST_MCP_TOKEN: 't' });
  const tool = async (name: string, args = {}) => {
    const r = (await server.rpc('tools/call', { name, arguments: args })).result;
    assert.ok(!r.isError, r.content?.[0]?.text);
    return r.structuredContent;
  };
  const settle = async (want: (v: any) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const v = await tool('progress');
      if (!v.busy && want(v)) return v;
      await new Promise((r) => setTimeout(r, 5));
    }
    const last = await tool('progress');
    throw new Error(`the run never settled: ${last.busy} ${JSON.stringify(last.progress?.run)} ${last.progress?.steps.map((s: any) => s.key + ':' + s.state).join(' ')}`);
  };
  try {
    await server.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    await tool('start_fetch', { fresh: true });
    let v = await settle((x) => ['stopped', 'done', 'partial'].includes(x.progress?.run.state));
    assert.equal(v.progress.run.state, 'stopped');
    assert.match(v.progress.run.error, /Unauthorized/);
    assert.equal(v.progress.steps.find((s: any) => s.key === 'discover').summary, '4 listings on 2 pages', 'only the pages the corpus needs');
    assert.deepEqual(v.progress.coverage.map((c: any) => c.id), ['sony:a7v', 'nikon:z5ii'], 'newest first; colours folded; refurbished left out');
    signedIn = true;
    const before = scraped.length;
    await tool('start_fetch', { fresh: false });
    v = await settle((x) => ['done', 'partial'].includes(x.progress?.run.state));
    assert.ok(!scraped.slice(before).some((u) => u.includes('/pn/2')), 'listing pages are not read again');
    // Facts come only from what readers record: three pages read for the lens mount.
    const queued = (await tool('read_queue', { camera: 'sony:a7v', limit: 20 })).pages;
    for (const src of ['bh', 'dpreview', 'wikipedia']) {
      const pg = queued.find((p: any) => p.source === src);
      const r = await tool('submit_reads', { page: pg.page, values: [{ spec: 'mount', value: 'Sony E', quote: 'Sony E' }, ...(src === 'bh' ? [{ spec: 'weight', value: { n: 695, unit: 'g' }, quote: '695 g (With Battery, Recording Media)' }, { spec: 'af_points', value: { n: 425 }, quote: 'Phase Detection: 759' }] : [])] });
      assert.equal(r.refused.length, src === 'bh' ? 1 : 0, 'a quote without the figure is refused');
    }
    await tool('reprocess');
    await settle((x) => ['done', 'partial'].includes(x.progress?.run.state));
    const cam = await tool('camera', { id: 'sony:a7v' });
    assert.equal(cam.name, 'Sony a7 V');
    assert.equal(cam.facts.mount.status, 'verified');
    assert.deepEqual(cam.facts.mount.owners.sort(), ['B&H', 'DPReview', 'Wikipedia']);
    assert.equal(cam.facts.weight.text, '695 g');
    assert.equal(cam.facts.weight.status, 'single');
    assert.equal(cam.facts.price_used.status, 'quote', 'a price is a dated quote, never a verified spec');
    assert.ok(cam.sources.every((s: any) => s.scrapedAt), 'every page keeps when it was scraped');
    const ad = cam.sources.find((s: any) => s.source === 'adorama');
    assert.equal(ad.url, 'https://web.archive.org/web/20261020101500/https://www.adorama.com/sony-a7-v-mirrorless-camera-body/p/isoa7v', "Adorama's newest Wayback copy");
    assert.equal(ad.scrapedAt, '2026-10-20T10:15:00.000Z');
    const saved = await tool('saved_page', { camera: 'sony:a7v', source: 'dpreview' });
    assert.match(saved.text, /^---\nurl: https:\/\/www\.dpreview\.com/);
    // Pictures: the front found by image search (its original, not the resized copy; the kit left out),
    // checked, shown to the reviewer as an image, approved, and kept.
    // B&H's own front came first, at full size, its white backdrop removed: no image search for it.
    assert.ok(served.includes(BH_FRONT) && !searches.some((s) => /a7 V" front/.test(s)));
    const q = (await server.rpc('tools/call', { name: 'review_queue', arguments: {} })).result;
    const shown = q.content.find((c: any) => c.type === 'image');
    assert.equal(shown?.mimeType, 'image/jpeg');
    const id = Number(q.content.find((c: any) => /^Candidate \d+: Sony a7 V, front/.test(c.text))?.text.match(/\d+/)[0]);
    await tool('judge_picture', { id, ok: true, why: 'bare body, straight on' });
    v = await tool('progress');
    const cells = v.progress.coverage.find((c: any) => c.id === 'sony:a7v').cells;
    assert.equal(cells.front.state, 'saved');
    assert.equal(cells.back.state, 'failed', 'a missing back is a failure, not optional');
    assert.ok(existsSync(join(dir, 'images', 'sony-a7v-front.png')), 'kept under a permanent name');
    // Kept for good: even a fetch from the start uses it as it is, never searching or downloading it again.
    const got = served.length, asked = searches.length;
    const got2 = scraped.length;
    await tool('start_fetch', { fresh: true });
    await settle((x) => x.progress?.run.id > v.progress.run.id && ['done', 'partial', 'stopped'].includes(x.progress?.run.state));
    assert.ok(searches.slice(asked).some((s) => /a7 V" back/.test(s)), 'the fresh run reached its pictures');
    assert.equal(scraped.length, got2, 'a fetch from the start reads no page fetched in the last month again');
    assert.match((await tool('progress')).progress.steps.find((s: any) => s.key === 'scrape').summary, /reused from the last 30 days/);
    assert.ok(!searches.slice(asked).some((s) => /a7 V" front/.test(s)) && !served.slice(got).includes(BH_FRONT));
    // A run made before a step existed still reads, the new step waiting.
    const { DatabaseSync } = await import('node:sqlite');
    new DatabaseSync(join(dir, 'ca.db')).prepare("DELETE FROM steps WHERE key = 'images'").run();
    assert.ok((await tool('progress')).progress.steps.find((s: any) => s.key === 'images'));
    // Reprocessing reads the saved pages again, never the web.
    const n = scraped.length;
    await tool('reprocess');
    await settle((x) => ['done', 'partial'].includes(x.progress?.run.state));
    assert.equal(scraped.length, n);
    assert.equal((await tool('camera', { id: 'sony:a7v' })).facts.mount.status, 'verified');
  } finally {
    server.stop();
    gw.close();
  }
});
