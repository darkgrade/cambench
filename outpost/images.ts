// Product pictures made consistent: only pictures that are already transparent are used (cutting a
// background away shows), only the camera kept (a badge or caption beside it dropped), trimmed, and
// fitted to one canvas with one margin, so every camera sits the same size on whatever is behind it.
// The pixels go through ffmpeg as raw RGBA; the rest is here.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const W = 1600, H = 1200, MARGIN = 0.06;
const run = (cmd: string, args: string[], input?: Buffer) =>
  execFileSync(cmd, args, { input, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'], timeout: 60_000 });

function download(url: string, file: string) {
  run('curl', ['-sfL', '--max-time', '40', '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', '-o', file, url]);
  if (!existsSync(file)) throw new Error(`nothing downloaded from ${url}`);
}
// The picture as RGBA pixels, at most 2000 pixels across, with its own size.
function decode(file: string) {
  const [w, h] = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
  if (!w || !h) throw new Error('not an image');
  const s = Math.min(1, 2000 / w), ow = Math.round(w * s), oh = Math.round(h * s);
  const px = run('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', `scale=${ow}:${oh}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  return { w: ow, h: oh, px, width: w, height: h };
}

// B&H's convention: every product shot on pure white. That white is taken away, never anything else:
// the backdrop is flooded in from the edges; a hole in the body that shows the same pure white (a strap
// eyelet: a solid blob) goes too; only a 2-pixel outline is softened, by colour-to-alpha, which also
// takes off the white fringe. White lettering and glints, never quite that pure or that solid, stay.
// Kevin approved this on B&H's pictures (2026-11-05). Any other backdrop is refused.
export function whiteToAlpha(w: number, h: number, px: Buffer) {
  const n = w * h, T = 18;
  const dist = (i: number) => 255 - Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  // A white backdrop owns most of the edges (a wide body may touch the sides), and the typical edge pixel is pure white.
  const ed = border.map(dist).sort((x, y) => x - y);
  if (border.filter((i) => dist(i) <= 4).length / border.length < 0.75 || ed[ed.length >> 1] > 2) return false;
  const bg = new Uint8Array(n), q = new Int32Array(n);
  let head = 0, tail = 0;
  for (const i of border) if (!bg[i] && dist(i) < T) (bg[i] = 1), (q[tail++] = i);
  const nb = (i: number) => { const x = i % w; return [i - w, i + w, x ? i - 1 : -1, x < w - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < n); };
  while (head < tail) for (const j of nb(q[head++])) if (!bg[j] && dist(j) < T) (bg[j] = 1), (q[tail++] = j);
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (bg[s] || seen[s] || dist(s) >= T) continue;
    const part: number[] = [];
    let top = 0;
    q[top++] = s;
    seen[s] = 1;
    while (top) { const k = q[--top]; part.push(k); for (const j of nb(k)) if (!seen[j] && !bg[j] && dist(j) < T) (seen[j] = 1), (q[top++] = j); }
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (const k of part) { const x = k % w, y = (k / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ds = part.map(dist).sort((a, b) => a - b);
    if (part.length >= 30 && bw >= 5 && bh >= 5 && part.length / (bw * bh) >= 0.55 && Math.max(bw, bh) <= 3 * Math.min(bw, bh) && ds[ds.length >> 1] <= 3) for (const k of part) bg[k] = 1;
  }
  const near = new Uint8Array(n).fill(9);
  for (let k = 0; k < n; k++) if (bg[k]) near[k] = 0;
  for (let pass = 1; pass <= 2; pass++) for (let k = 0; k < n; k++) if (near[k] > pass && nb(k).some((j) => near[j] === pass - 1)) near[k] = pass;
  for (let k = 0; k < n; k++) {
    if (bg[k]) { px[k * 4 + 3] = 0; continue; }
    if (near[k] > 2) { px[k * 4 + 3] = 255; continue; }
    const a = Math.max(255 - px[k * 4], 255 - px[k * 4 + 1], 255 - px[k * 4 + 2]) / 255;
    for (let c = 0; c < 3; c++) px[k * 4 + c] = a ? Math.round(Math.max(0, Math.min(255, (px[k * 4 + c] - 255 * (1 - a)) / a))) : 0;
    px[k * 4 + 3] = Math.round(a * 255);
  }
  return true;
}

// The camera alone, from a transparent picture; null for an opaque one.
export function cutout(w: number, h: number, px: Buffer) {
  const n = w * h, alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = px[i * 4 + 3];
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  // Only a picture that is already transparent: a background cut away by us shows, so an opaque
  // picture is never used (Kevin, 2026-11-05).
  const clear = border.filter((i) => alpha[i] < 20).length / border.length;
  if (clear < 0.6) return null;
  // Only the largest solid shape stays: the camera, not a badge, a logo or a caption beside it.
  const label = new Int32Array(n).fill(-1), sizes: number[] = [], stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (alpha[s] < 40 || label[s] >= 0) continue;
    const id = sizes.length;
    let top = 0, size = 0;
    stack[top++] = s;
    label[s] = id;
    while (top) {
      const i = stack[--top], x = i % w;
      size++;
      for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) if (j >= 0 && j < n && label[j] < 0 && alpha[j] >= 40) (label[j] = id), (stack[top++] = j);
    }
    sizes.push(size);
  }
  if (!sizes.length) return null;
  const big = sizes.indexOf(Math.max(...sizes));
  if (sizes[big] < n * 0.04) return null;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  const out = Buffer.from(px);
  for (let i = 0; i < n; i++) {
    const keep = label[i] === big || (label[i] < 0 && alpha[i] > 0 && near(label, i, w, h, big));
    out[i * 4 + 3] = keep ? alpha[i] : 0;
    if (keep && alpha[i] >= 40) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { w, h, px: out, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}
// A faint rim pixel stays when it touches the camera.
const near = (label: Int32Array, i: number, w: number, h: number, id: number) => {
  const x = i % w;
  return [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1].some((j) => j >= 0 && j < w * h && label[j] === id);
};

// The camera trimmed and centred on a clear W×H canvas, the same margin for every camera.
function place(c: NonNullable<ReturnType<typeof cutout>>, file: string, size: [number, number]) {
  const { box } = c, rows: Buffer[] = [];
  for (let y = box.y; y < box.y + box.h; y++) rows.push(c.px.subarray((y * c.w + box.x) * 4, (y * c.w + box.x + box.w) * 4));
  const [cw, ch] = size, iw = Math.round(cw * (1 - 2 * MARGIN)), ih = Math.round(ch * (1 - 2 * MARGIN));
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${box.w}x${box.h}`, '-i', '-', '-vf',
    `scale=${iw}:${ih}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${cw}:${ch}:(ow-iw)/2:(oh-ih)/2:color=black@0`, '-pix_fmt', 'rgba', file], Buffer.concat(rows));
}
// The least a picture must be: transparent, and over 1,000 pixels on its long side (Kevin, 2026-11-05).
export const MIN_PX = 1001;
// One candidate checked and kept: <stem>.png (W×H, the camera fitted), -thumb.png, and -look.jpg (on
// grey, for the reviewer to see). Or why it is not one.
// urls: the same picture at its sizes, largest first (the first that downloads is used). white: a
// B&H picture, whose pure-white backdrop is taken away.
export function candidate(urls: string | string[], dir: string, stem: string, white = false): { file: string; thumb: string; look: string; width: number; height: number; url: string } | { reject: string } {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `${stem}.download`);
  try {
    let d: ReturnType<typeof decode> | null = null, url = '';
    for (const u of [urls].flat()) {
      try { download(u, tmp); d = decode(tmp); url = u; break; } catch { rmSync(tmp, { force: true }); }
    }
    if (!d) return { reject: 'nothing downloaded' };
    if (white && !whiteToAlpha(d.w, d.h, d.px)) return { reject: 'not on a pure-white backdrop' };
    if (Math.max(d.width, d.height) < MIN_PX) return { reject: `${d.width}×${d.height}, not over ${MIN_PX - 1} px` };
    const c = cutout(d.w, d.h, d.px);
    if (!c) return { reject: 'not transparent' };
    const file = join(dir, `${stem}.png`), thumb = join(dir, `${stem}-thumb.png`), look = join(dir, `${stem}-look.jpg`);
    place(c, file, [W, H]);
    place(c, thumb, [480, 360]);
    run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x808080:s=800x600', '-i', thumb, '-filter_complex', '[1]scale=800:600[t];[0][t]overlay', '-frames:v', '1', '-q:v', '4', look]);
    return { file, thumb, look, width: d.width, height: d.height, url };
  } catch (e: any) {
    return { reject: String(e?.message || e).slice(0, 120) };
  } finally {
    rmSync(tmp, { force: true });
  }
}
export const dataUrl = (file: string) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
