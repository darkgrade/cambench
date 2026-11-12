// The post-processing, end to end on its public seams: a reader submits typed values for saved pages; the
// app keeps only quoted, standard values; consensus counts independent owners (a maker's sites once, a page
// that repeats another's wording once), applies "not applicable", sets aside adjudicated errors, and the run
// is measured against the golden set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CAMERA_ATLAS_DB = join(mkdtempSync(join(tmpdir(), 'reads-')), 'ca.db');
const D = await import('../dictionary.ts');
const P = await import('../pipeline.ts');
const R = await import('../reads.ts');
const C = await import('../consensus.ts');

test('values normalise to the standard, from the units a page uses', () => {
  assert.deepEqual(D.normalise('weight', { n: 24.66, unit: 'oz' }), { ok: true, value: 699.1 });
  assert.deepEqual(D.normalise('evf_dots', { n: 3.69, unit: 'million' }), { ok: true, value: 3690000 });
  assert.deepEqual(D.normalise('dims', { w: 5.45, h: 3.87, d: 3.48, unit: 'in' }), { ok: true, value: { w: 138.4, h: 98.3, d: 88.4, tol: 1.3 } });
  assert.deepEqual(D.normalise('shutter_mech', 'None'), { ok: true, value: 'None' });
  assert.deepEqual(D.normalise('video_modes', [{ w: 3840, h: 2160, fps: [23.976, 59.94] }]), { ok: true, value: [{ w: 3840, h: 2160, fps: [24, 60] }] });
  assert.equal(D.normalise('msrp', { n: 2199, currency: 'EUR' }).ok, false, 'US dollars only');
  assert.deepEqual(D.normalise('shutter_min', '30 min'), { ok: true, value: 1800 });
  assert.ok(R.states('shutter_min', '1800', 'Slowest: 30 minutes') && R.states('evf_dots', { n: 9437184 }, 'approx. 9 437 184 dots'), 'minutes; thousands written with spaces');
  assert.equal(D.normalise('screen_type', 'Swivel').ok, false, 'one of the standard words');
  assert.ok(D.same('wifi', 'Yes', 'Wi-Fi 6') && !D.same('wifi', 'No', 'Wi-Fi 6'), '"Yes" agrees with any standard');
  assert.ok(D.same('dims', D.normalise('dims', { w: 4.4, h: 2.8, d: 1.6, unit: 'in' }).ok && (D.normalise('dims', { w: 4.4, h: 2.8, d: 1.6, unit: 'in' }) as any).value, (D.normalise('dims', { w: 112.8, h: 69.9, d: 41.8 }) as any).value), 'inches within their rounding');
});

function camera(id: string, name: string, brand: string) {
  const run = P.latestRun()?.id ?? P.newRun(false);
  P.db.prepare('INSERT OR IGNORE INTO cameras (run_id, id, name, brand, rank, info) VALUES (?, ?, ?, ?, ?, ?)').run(run, id, name, brand, 1, '{}');
  const page = (source: string, url: string, md: string) => {
    P.savePage(run, id, source, url, md, {});
    return (P.db.prepare('SELECT id FROM pages WHERE run_id = ? AND url = ? ORDER BY id DESC LIMIT 1').get(run, url) as any).id as number;
  };
  return { run, page, cam: P.cameras(run).find((c) => c.id === id) };
}

test('a reading must quote the page and state its figures; consensus counts independent owners', () => {
  const { run, page } = camera('canon:r8ii', 'Canon EOS R8 Mark II', 'Canon');
  const maker = page('vendor', 'https://www.canon-europe.com/cameras/eos-r8-mark-ii/specifications/', '# EOS R8 Mark II\n\n| AF Positions | Still photo: Max. 4368 positions |\n| --- | --- |\n| Maximum AF Zones | Still photo Max. 1053 zones |\n| Viewfinder | 0.39 inch OLED colour EVF, 2.36 Million dots |');
  const bh = page('bh', 'https://www.bhphotovideo.com/c/product/2001101-REG/canon_r8ii.html/specs', '# Canon EOS R8 Mark II\n\n| Autofocus Points | Photo<br>4368<br>Video<br>3588 |\n| --- | --- |\n| Resolution | 2,360,000 Dot |');
  const dpr = page('dpreview', 'https://www.dpreview.com/products/canon/slrs/canon_eosr8ii/specifications', '# Canon EOS R8 II\n\nNumber of focus points4368\n\nViewfinder resolution2360000 dots');
  const site = page('site:henrys.com', 'https://www.henrys.com/canon-eos-r8-mark-ii-body', '# Canon EOS R8 Mark II Body\n\nAF: 1,053 automatic AF zones\n\nEVF: 2.36M dots');
  assert.equal(R.queue(10, 'canon:r8ii').left, 4);
  const r = R.submit(maker, [
    { spec: 'af_points', value: { n: 4368 }, quote: 'Max. 4368 positions' },
    { spec: 'evf_dots', value: { n: 2.36, unit: 'million' }, quote: '2.36 Million dots' },
    { spec: 'mp', value: { n: 24.2 }, quote: 'OLED colour EVF' },
    { spec: 'evf', value: 'Electronic', quote: 'not on this page' },
  ]);
  assert.equal(r.accepted, 2);
  assert.deepEqual(r.refused.map((x: any) => x.spec), ['mp', 'evf'], 'a quote without the figure; a quote not on the page');
  R.submit(bh, [{ spec: 'af_points', value: { n: 4368 }, quote: 'Photo 4368' }, { spec: 'evf_dots', value: { n: 2360000 }, quote: '2,360,000 Dot' }]);
  R.submit(dpr, [{ spec: 'af_points', value: { n: 4368 }, quote: 'Number of focus points4368' }, { spec: 'evf_dots', value: { n: 2360000 }, quote: '2360000 dots' }]);
  R.submit(site, [{ spec: 'af_points', value: { n: 1053 }, quote: '1,053 automatic AF zones' }]);
  assert.equal(R.queue(10, 'canon:r8ii').left, 0, 'each page read once, while its content stays the same');
  const f = C.factsForCamera(run, P.cameras(run).find((c) => c.id === 'canon:r8ii'));
  assert.equal(f.af_points.status, 'verified');
  assert.equal(f.af_points.value, 4368);
  assert.deepEqual(f.af_points.owners.sort(), ['B&H', 'Canon', 'DPReview']);
  assert.equal(f.af_points.conflicts.length, 1, "henrys.com's zones disagree");
  // The adjudicator files the zones as another measure: they no longer count against the points.
  const c = R.conflicts('canon:r8ii').items.find((x: any) => x.spec === 'af_points');
  const zones = c.groups.find((g: any) => g.value === '1,053 points').readings[0];
  R.judge('canon:r8ii', 'af_points', c.key, [{ sha: zones.sha, verdict: 'other', note: 'automatic AF zones, not selectable points' }]);
  assert.equal(C.factsForCamera(run, P.cameras(run).find((x) => x.id === 'canon:r8ii')).af_points.conflicts.length, 0);
  assert.equal(R.conflicts('canon:r8ii').items.some((x: any) => x.spec === 'af_points'), false, 'judged once');
  // Against the golden set: af_points and evf_dots right; everything else not yet read.
  const e = R.evaluate();
  assert.ok(e.total >= 38 && e.right >= 2 && !e.misses.some((m: any) => m.camera === 'canon:r8ii' && ['af_points', 'evf_dots'].includes(m.spec)));
});

test('one list page speaks for each camera it names, each its own reading', () => {
  const md = '# Cameras that work as UVC webcams\n\n- Canon EOS R6 Mark III (4K60)\n- Sony a7R VI (4K30)';
  const a = camera('canon:r6iii', 'Canon EOS R6 Mark III', 'Canon');
  const pa = a.page('site:diiorio.me', 'https://diiorio.me/posts/uvc-cameras/', md);
  const b = camera('sony:a7rvi', 'Sony a7R VI', 'Sony');
  const pb = b.page('site:diiorio.me', 'https://diiorio.me/posts/uvc-cameras/#sony', md);
  R.submit(pa, [{ spec: 'webcam_res', value: [{ w: 3840, h: 2160, fps: [60] }], quote: 'Canon EOS R6 Mark III (4K60)' }]);
  R.submit(pb, [{ spec: 'webcam_res', value: [{ w: 3840, h: 2160, fps: [30] }], quote: 'Sony a7R VI (4K30)' }]);
  const fa = C.factsForCamera(a.run, P.cameras(a.run).find((c) => c.id === 'canon:r6iii'));
  const fb = C.factsForCamera(b.run, P.cameras(b.run).find((c) => c.id === 'sony:a7rvi'));
  assert.deepEqual([fa.webcam_res.value[0].fps, fb.webcam_res.value[0].fps], [[60], [30]], 'neither reading replaced the other');
});

test('copied wording counts once; a spec that cannot apply is settled by what it depends on', () => {
  const { run, page } = camera('nikon:z5iic', 'Nikon Z5 IIC', 'Nikon');
  const rows = ['Nikon Z mount', '24.5 MP', 'EN-EL15c', 'No EVF', 'Approx. 538 g', '134 x 80.5 x 72 mm', 'ISO 100 to 64,000', '30 fps', 'Wi-Fi 5'];
  const vals: any[] = [['mount', 'Nikon Z'], ['mp', { n: 24.5 }], ['battery', 'EN-EL15c'], ['evf', 'None'], ['weight_body', { n: 538 }], ['dims', { w: 134, h: 80.5, d: 72 }], ['iso_max', { n: 64000 }], ['burst', { n: 30 }], ['wifi', 'Wi-Fi 5']];
  const sheet = `# Nikon Z5 IIC\n\n${rows.join('\n\n')}`;
  const a = page('bh', 'https://www.bhphotovideo.com/c/product/1888888-REG/nikon_z5iic.html/specs', sheet);
  const b = page('site:kmcamera.com', 'https://www.kmcamera.com/nikon-z5iic', `${sheet}\n\nKM Camera`);
  const n = page('vendor', 'https://www.nikonusa.com/p/z5iic/specs', '# Z5IIc\n\nViewfinder: none\n\n24.5 million effective pixels');
  const s = page('dpreview', 'https://www.dpreview.com/products/nikon/slrs/nikon_z5iic/specifications', '# Nikon Z5IIc\n\nViewfinder typeNone');
  for (const p of [a, b]) R.submit(p, vals.map(([spec, value], i) => ({ spec, value, quote: rows[i] })));
  R.submit(n, [{ spec: 'evf', value: 'None', quote: 'Viewfinder: none' }, { spec: 'mp', value: { n: 24.5 }, quote: '24.5 million effective' }]);
  R.submit(s, [{ spec: 'evf', value: 'None', quote: 'Viewfinder typeNone' }]);
  const f = C.factsForCamera(run, P.cameras(run).find((c) => c.id === 'nikon:z5iic'));
  assert.deepEqual(f.mount.owners, ['B&H'], "KM Camera's copy of B&H's sheet is B&H again");
  assert.equal(f.mp.status, 'likely', 'B&H (with its copy) and Nikon: two owners');
  assert.equal(f.evf.status, 'verified');
  assert.equal(f.evf_dots.text, 'Not applicable (no built-in viewfinder)');
  assert.equal(f.evf_dots.status, 'verified');
  // No expanded range above the native maximum: the native maximum is the highest selectable.
  for (const p of [n, s]) R.submit(p, []);
  const z = page('site:neocamera.com', 'https://www.neocamera.com/camera/nikon-z5iic', '# Nikon Z5IIc\n\nISO 100-64000');
  const y = page('site:henrys.com', 'https://www.henrys.com/nikon-z5iic', '# Nikon Z5IIc\n\nISO 100 to 64,000, extended to 64,000');
  R.submit(z, [{ spec: 'iso_max', value: { n: 64000 }, quote: 'ISO 100-64000' }]);
  R.submit(y, [{ spec: 'iso_max', value: { n: 64000 }, quote: 'ISO 100 to 64,000' }, { spec: 'iso_ext', value: { n: 64000 }, quote: 'extended to 64,000' }]);
  const g = C.factsForCamera(run, P.cameras(run).find((c) => c.id === 'nikon:z5iic'));
  assert.equal(g.iso_ext.status, 'verified');
  assert.equal(g.iso_ext.value, 64000);
});
