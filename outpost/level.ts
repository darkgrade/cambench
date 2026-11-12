// Spec level, 0 to 100: ten areas, each scored on a fixed scale (not against the other cameras, so a level does not
// move when the corpus changes and a tie is not a half), weighted by how much the area matters to a camera body.
// Every area says why it scored what it did; an area with nothing known is left out and the rest are reweighted.
// A disputed value is not used. Facts are the consensus's (consensus.ts): { value, status }.

type F = Record<string, { value: any; status: string } | undefined>;
export interface Reason { area: string; weight: number; score: number; points: number; why: string }
export interface Level { level: number | null; coverage: number; reasons: Reason[]; missing: string[]; strengths: string[]; weaknesses: string[] }

const clamp = (x: number) => Math.max(0, Math.min(1, x));
// Where x sits between lo (0) and hi (1) on a log scale: each doubling counts the same.
const logScale = (x: number, lo: number, hi: number) => clamp(Math.log(x / lo) / Math.log(hi / lo));
const lin = (x: number, lo: number, hi: number) => clamp((x - lo) / (hi - lo));
const fmt = (n: number) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n.toLocaleString('en-US'));
const RAW = /RAW/;

function get(f: F, id: string) {
  const x = f[id];
  if (!x || x.status === 'disputed' || x.value == null) return undefined;
  return x.value;
}

// Each area: its weight and a scorer returning a 0..1 score and the reason, or null when nothing is known.
const AREAS: Array<{ area: string; weight: number; score: (f: F) => { s: number; why: string } | null }> = [
  { area: 'Resolution', weight: 14, score: (f) => {
    const mp = get(f, 'mp');
    if (typeof mp !== 'number') return null;
    // 12 MP is the floor, 100 MP the top (medium format reaches past it).
    return { s: logScale(mp, 12, 100), why: `${mp} MP` };
  } },
  { area: 'Video', weight: 18, score: (f) => {
    const modes = get(f, 'video_modes'), bits = get(f, 'video_bits'), codecs: string[] = get(f, 'video_formats') || [];
    if (!Array.isArray(modes) || !modes.length) return null;
    const top = Math.max(...modes.map((m: any) => m.w));
    const uhd = modes.filter((m: any) => m.w >= 3840);
    const fps4k = uhd.length ? Math.max(...uhd.flatMap((m: any) => m.fps)) : 0;
    const raw = codecs.some((c) => RAW.test(c)), prores = codecs.includes('ProRes');
    // Width: 1080p 0, 4K 0.4, 6K 0.7, 8K 1. 4K rate: 30p 0.3, 60p 0.6, 120p 1.
    const res = top >= 7680 ? 1 : top >= 5760 ? 0.7 + ((top - 5760) / 1920) * 0.3 : top >= 3840 ? 0.4 + ((top - 3840) / 1920) * 0.3 : 0;
    const rate = fps4k ? clamp(fps4k / 120) : 0;
    const depth = typeof bits === 'number' ? (bits >= 12 ? 1 : bits >= 10 ? 0.6 : 0) : 0.3;
    const pro = raw ? 1 : prores ? 0.6 : 0;
    const k = top >= 7680 ? '8K' : top >= 5760 ? `${Math.round(top / 1000)}K` : top >= 3840 ? '4K' : 'HD';
    const why = [`${k} top`, fps4k ? `4K ${Math.round(fps4k)}p` : 'no 4K', typeof bits === 'number' ? `${bits}-bit` : null, raw ? 'internal RAW' : prores ? 'ProRes' : null].filter(Boolean).join(', ');
    return { s: 0.35 * res + 0.25 * rate + 0.2 * depth + 0.2 * pro, why };
  } },
  { area: 'Burst', weight: 12, score: (f) => {
    const b = get(f, 'burst');
    if (typeof b !== 'number') return null;
    // 5 fps is the floor, 60 fps the top.
    return { s: logScale(b, 5, 60), why: `${b} fps` };
  } },
  { area: 'Viewfinder', weight: 10, score: (f) => {
    const evf = get(f, 'evf'), dots = get(f, 'evf_dots'), mag = get(f, 'evf_mag');
    if (evf === 'None') return { s: 0, why: 'no viewfinder' };
    if (typeof dots !== 'number') return evf ? { s: 0.3, why: 'viewfinder, resolution unknown' } : null;
    // 1.44M dots to 9.44M; magnification 0.6× to 0.9×.
    const d = logScale(dots, 1.44e6, 9.44e6), m = typeof mag === 'number' ? lin(mag, 0.6, 0.9) : d;
    return { s: 0.75 * d + 0.25 * m, why: `${fmt(dots)}-dot EVF${typeof mag === 'number' ? `, ${mag}×` : ''}` };
  } },
  { area: 'Stabilization', weight: 8, score: (f) => {
    const v = get(f, 'ibis');
    if (typeof v !== 'boolean') return null;
    return { s: v ? 1 : 0, why: v ? 'in-body stabilization' : 'no in-body stabilization' };
  } },
  { area: 'Card slots', weight: 8, score: (f) => {
    const slots = get(f, 'slots');
    if (!Array.isArray(slots) || !slots.length) return null;
    // Each slot by the fastest card it takes; two CFexpress slots are the top.
    const one = (cards: string[]) => (cards.some((c) => /CFexpress|XQD|CFast|SSD/.test(c)) ? 0.5 : cards.includes('SD UHS-II') ? 0.35 : cards.includes('SD UHS-I') ? 0.2 : 0.1);
    const short = (cards: string[]) => cards.find((c) => /CFexpress|XQD|CFast|SSD/.test(c))?.replace('Internal SSD', 'SSD') || cards[0] || 'card';
    return { s: clamp(slots.reduce((n: number, c: string[]) => n + one(c), 0)), why: `${slots.length === 1 ? 'single' : slots.length === 2 ? 'dual' : slots.length} slot${slots.length > 1 ? 's' : ''} (${slots.map(short).join(' + ')})` };
  } },
  { area: 'Build and battery', weight: 8, score: (f) => {
    const sealed = get(f, 'sealed'), life = get(f, 'battery_life');
    if (typeof sealed !== 'boolean' && typeof life !== 'number') return null;
    // CIPA shots: 250 to 800.
    const b = typeof life === 'number' ? lin(life, 250, 800) : null, w = typeof sealed === 'boolean' ? (sealed ? 1 : 0) : null;
    const s = b == null ? w! : w == null ? b : 0.5 * w + 0.5 * b;
    return { s, why: [w == null ? null : sealed ? 'weather-sealed' : 'not sealed', b == null ? null : `${life} shots (CIPA)`].filter(Boolean).join(', ') };
  } },
  { area: 'Autofocus', weight: 6, score: (f) => {
    const p = get(f, 'af_points');
    if (typeof p !== 'number') return null;
    // Makers count points differently, so a light weight: 100 to 6,000 positions.
    return { s: logScale(p, 100, 6000), why: `${p.toLocaleString('en-US')} AF points` };
  } },
  { area: 'Screen', weight: 6, score: (f) => {
    const dots = get(f, 'screen_dots'), type = get(f, 'screen_type'), touch = get(f, 'touch');
    if (typeof dots !== 'number' && !type) return null;
    const d = typeof dots === 'number' ? logScale(dots, 1e6, 3.2e6) : 0.4;
    const t = type === 'Fully articulated' || type === 'Multi-angle' ? 1 : type === 'Tilting' ? 0.6 : type === 'Fixed' ? 0 : 0.5;
    return { s: 0.5 * d + 0.4 * t + 0.1 * (touch ? 1 : 0), why: [typeof dots === 'number' ? `${fmt(dots)}-dot` : null, type ? String(type).toLowerCase() : null, 'screen'].filter(Boolean).join(' ') };
  } },
  { area: 'Shutter and ISO', weight: 6, score: (f) => {
    const iso = get(f, 'iso_max'), el = get(f, 'shutter_elec'), mech = get(f, 'shutter_mech');
    const parts: Array<[number, string]> = [];
    if (typeof iso === 'number') parts.push([logScale(iso, 25600, 204800), `ISO ${iso.toLocaleString('en-US')}`]);
    if (typeof el === 'number') parts.push([logScale(1 / el, 8000, 80000), `1/${Math.round(1 / el).toLocaleString('en-US')} s electronic`]);
    if (mech === 'None') parts.push([0.5, 'no mechanical shutter']);
    if (!parts.length) return null;
    return { s: parts.reduce((n, p) => n + p[0], 0) / parts.length, why: parts.map((p) => p[1]).join(', ') };
  } },
  { area: 'Connectivity', weight: 4, score: (f) => {
    const wifi = get(f, 'wifi'), ports: string[] | undefined = get(f, 'ports');
    if (!wifi && !ports) return null;
    const w = wifi === 'Wi-Fi 7' || wifi === 'Wi-Fi 6E' ? 1 : wifi === 'Wi-Fi 6' ? 0.8 : wifi === 'Wi-Fi 5' ? 0.5 : wifi && wifi !== 'No' ? 0.3 : 0;
    const p = ports ? clamp([ports.includes('HDMI (Full)'), ports.includes('Headphone 3.5 mm'), ports.includes('USB-C'), ports.includes('Ethernet') || ports.includes('Timecode')].filter(Boolean).length / 3) : 0.4;
    return { s: 0.4 * w + 0.6 * p, why: [wifi && wifi !== 'Yes' ? wifi : wifi === 'Yes' ? 'Wi-Fi' : null, ports?.includes('HDMI (Full)') ? 'full HDMI' : null, ports?.includes('Headphone 3.5 mm') ? 'headphone' : null].filter(Boolean).join(', ') || 'basic ports' };
  } },
];
export const LEVEL_AREAS = AREAS.map((a) => ({ area: a.area, weight: a.weight }));

export function levelOf(f: F): Level {
  const reasons: Reason[] = [], missing: string[] = [];
  for (const a of AREAS) {
    const r = a.score(f);
    if (!r) { missing.push(a.area); continue; }
    const score = Math.round(clamp(r.s) * 100);
    reasons.push({ area: a.area, weight: a.weight, score, points: Math.round(clamp(r.s) * a.weight * 10) / 10, why: r.why });
  }
  const w = reasons.reduce((n, r) => n + r.weight, 0), total = AREAS.reduce((n, a) => n + a.weight, 0);
  // Too little known to say (under half the weight): no level rather than a wrong one.
  const level = w >= total / 2 ? Math.round((reasons.reduce((n, r) => n + (r.score / 100) * r.weight, 0) / w) * 100) : null;
  // What lifts it and what holds it back most: the weighted gap from the area's middle, only where it moves
  // the level by a few points (a good port on a light area is not a strength).
  const pull = (r: Reason) => (r.score - 50) * r.weight, BIG = 120;
  const ranked = [...reasons].sort((a, b) => pull(b) - pull(a));
  return {
    level, coverage: Math.round((w / total) * 100), reasons, missing,
    strengths: ranked.filter((r) => pull(r) >= BIG).slice(0, 3).map((r) => r.why),
    weaknesses: ranked.filter((r) => pull(r) <= -BIG).reverse().slice(0, 3).map((r) => r.why),
  };
}
