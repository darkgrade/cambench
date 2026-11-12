// The spec dictionary: the one place a spec is defined. Each says exactly what is measured (so a source's
// other measure is a note, never a rival value), what type its value is, the units a reader may give it in
// (converted here, in code), how two values are compared, how it is shown, and when it cannot apply.
// Readers (agents) return typed JSON per spec; normalise() turns it into the standard or says why not.
// Changing a spec's definition: raise VERSION, and every page is read again for it.

export const VERSION = 1;
export type Kind = 'enum' | 'bool' | 'number' | 'shutter' | 'text' | 'date' | 'money' | 'dims' | 'sensor' | 'modes' | 'set' | 'slots' | 'level';
export interface Spec {
  id: string; label: string; group: string; kind: Kind; definition: string; input: string;
  options?: string[]; unit?: string; units?: Record<string, number>; range?: [number, number]; rel?: number;
  // A spec that cannot apply when another is settled (no viewfinder: no viewfinder resolution).
  na?: { when: string; is: any; because: string }; quote?: boolean; score?: (v: any) => number | null;
}
const MOUNTS = ['Sony E', 'Canon RF', 'Nikon Z', 'L-Mount', 'Leica M', 'Fujifilm X', 'Fujifilm G', 'Micro Four Thirds', 'Hasselblad XCD', 'Canon EF', 'Nikon F', 'Pentax K'];
const STILLS = ['RAW', 'JPEG', 'HEIF', 'TIFF', 'DNG'];
const CODECS = ['H.264', 'H.265', 'ProRes', 'ProRes RAW', 'Blackmagic RAW', 'N-RAW', 'Cinema RAW Light', 'XF-AVC', 'XAVC S', 'XAVC HS', 'XAVC S-I'];
const PORTS = ['USB-C', 'Micro-USB', 'HDMI (Full)', 'HDMI (Micro)', 'HDMI (Mini)', 'Microphone 3.5 mm', 'Headphone 3.5 mm', 'Remote', 'Flash sync (PC)', 'Ethernet', 'Timecode', 'XLR (via handle)'];
const CARDS = ['CFexpress Type A', 'CFexpress Type B', 'SD UHS-II', 'SD UHS-I', 'microSD', 'XQD', 'CFast', 'Internal SSD'];
const WIFI = ['No', 'Yes', 'Wi-Fi 4', 'Wi-Fi 5', 'Wi-Fi 6', 'Wi-Fi 6E', 'Wi-Fi 7'];
const BT = ['No', 'Yes', '4.1', '4.2', '5.0', '5.1', '5.2', '5.3', '5.4'];
const g = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 }, mm = { mm: 1, cm: 10, in: 25.4 }, dots = { dots: 1, k: 1e3, million: 1e6 };

export const SPECS: Spec[] = [
  { id: 'type', label: 'Type', group: 'Overview', kind: 'enum', options: ['Mirrorless', 'DSLR', 'Cinema', 'Rangefinder', 'Compact'], definition: 'The body type.', input: '"Mirrorless"' },
  { id: 'mount', label: 'Lens mount', group: 'Overview', kind: 'enum', options: MOUNTS, definition: 'The lens mount on the body.', input: `one of ${MOUNTS.join(', ')}` },
  { id: 'sensor', label: 'Sensor size', group: 'Overview', kind: 'sensor', options: ['Full frame', 'Medium format', 'APS-C', 'Micro Four Thirds', '1-inch'], definition: 'The sensor format, and its width and height in mm where the page states them.', input: '{"format": "Full frame", "w": 35.9, "h": 23.9} (w and h only if the page states them)' },
  { id: 'mp', label: 'Sensor resolution', group: 'Overview', kind: 'number', unit: 'MP', range: [5, 250], definition: 'Effective megapixels (not total or "actual" pixels).', input: '{"n": 24.5}', score: (v) => v },
  { id: 'ibis', label: 'In-body stabilization', group: 'Overview', kind: 'bool', definition: 'Whether the sensor is stabilized in the body (sensor-shift / IBIS). Electronic or digital stabilization for video only is false. The stops rating, if stated, goes in "note".', input: 'true | false', score: (v) => (v ? 1 : 0) },
  { id: 'announced', label: 'Initial release date', group: 'Overview', kind: 'date', definition: 'The day the maker announced the camera (its press release date). Not an on-sale or shipping date.', input: '"2026-10-23" (or "2026-10" when only the month is stated)' },
  { id: 'msrp', label: 'Initial release MSRP', group: 'Price', kind: 'money', definition: 'The US launch price of the body alone, in US dollars, as announced.', input: '{"n": 2199, "currency": "USD"} (only US dollars)' },
  { id: 'price_new', label: 'Current new price', group: 'Price', kind: 'money', quote: true, definition: "This retailer's current price for the body alone, new, in US dollars.", input: '{"n": 2199, "currency": "USD"}' },
  { id: 'price_used', label: 'Current used price', group: 'Price', kind: 'money', quote: true, definition: "This seller's current price for a used body alone, in US dollars.", input: '{"n": 1899, "currency": "USD"}' },
  { id: 'af_points', label: 'AF points', group: 'Autofocus', kind: 'number', unit: 'points', range: [9, 20000], definition: 'The most AF positions or points that can be selected for stills, as the maker counts them ("AF positions", "focus points", "AF points"). Not automatic AF zones, not video positions, not cross-type counts: put those in "note".', input: '{"n": 4368}', score: (v) => Math.log10(v) },
  { id: 'screen_size', label: 'Display size', group: 'Display', kind: 'number', unit: 'in', units: { in: 1, cm: 1 / 2.54 }, range: [1.5, 8], rel: 0.02, definition: 'The rear screen diagonal.', input: '{"n": 3.2, "unit": "in"} or {"n": 8.0, "unit": "cm"}' },
  { id: 'screen_dots', label: 'Display resolution', group: 'Display', kind: 'number', unit: 'dots', units: dots, range: [1e5, 2e7], rel: 0.015, definition: 'The rear screen resolution in dots.', input: '{"n": 2.1, "unit": "million"} or {"n": 2100000, "unit": "dots"}', score: (v) => v },
  { id: 'screen_type', label: 'Display articulation', group: 'Display', kind: 'enum', options: ['Fixed', 'Tilting', 'Fully articulated', 'Multi-angle'], definition: 'How the rear screen moves: Fully articulated (side-hinged, vari-angle, flip-out), Tilting (up/down only), Multi-angle (tilts and flips, e.g. 4-axis or tilt-and-free-angle), or Fixed.', input: '"Tilting"' },
  { id: 'touch', label: 'Touchscreen', group: 'Display', kind: 'bool', definition: 'Whether the rear screen is a touchscreen.', input: 'true | false' },
  { id: 'evf', label: 'Viewfinder', group: 'Viewfinder', kind: 'enum', options: ['Electronic', 'Optical', 'None'], definition: 'A built-in viewfinder. An optional, attachable accessory viewfinder is "None".', input: '"Electronic" | "Optical" | "None"' },
  { id: 'evf_dots', label: 'Viewfinder resolution', group: 'Viewfinder', kind: 'number', unit: 'dots', units: dots, range: [1e5, 3e7], rel: 0.015, na: { when: 'evf', is: 'None', because: 'no built-in viewfinder' }, definition: 'The built-in viewfinder resolution in dots (never an optional accessory viewfinder).', input: '{"n": 3.69, "unit": "million"}', score: (v) => v },
  { id: 'evf_mag', label: 'Viewfinder magnification', group: 'Viewfinder', kind: 'number', unit: '×', range: [0.3, 1.5], na: { when: 'evf', is: 'None', because: 'no built-in viewfinder' }, definition: 'Built-in viewfinder magnification (with a 50 mm lens at infinity, 35 mm equivalent).', input: '{"n": 0.78}' },
  { id: 'battery', label: 'Battery type', group: 'Body', kind: 'text', definition: "The battery's model code.", input: '"NP-FZ100"' },
  { id: 'battery_life', label: 'Battery life (CIPA)', group: 'Body', kind: 'number', unit: 'shots', range: [50, 10000], definition: 'CIPA-rated shots per charge using the rear screen (LCD), as the maker\'s spec sheet publishes it (not a viewfinder figure). Other modes go in "note".', input: '{"n": 630}', score: (v) => v },
  { id: 'weight', label: 'Weight', group: 'Body', kind: 'number', unit: 'g', units: g, range: [100, 5000], rel: 0.012, definition: 'Weight with battery and memory card (CIPA).', input: '{"n": 695, "unit": "g"} (or oz, lb, kg)' },
  { id: 'weight_body', label: 'Weight (body only)', group: 'Body', kind: 'number', unit: 'g', units: g, range: [100, 5000], rel: 0.012, definition: 'Weight of the body alone, without battery or card.', input: '{"n": 610, "unit": "g"}' },
  { id: 'dims', label: 'Dimensions', group: 'Body', kind: 'dims', units: mm, definition: 'Width × height × depth of the body.', input: '{"w": 130.3, "h": 96.4, "d": 82.4, "unit": "mm"} (or cm, in)' },
  { id: 'sealed', label: 'Weatherproofing', group: 'Body', kind: 'bool', definition: 'Whether the body is dust- and moisture-resistant (weather-sealed). "Waterproof: No" says nothing about sealing.', input: 'true | false', score: (v) => (v ? 1 : 0) },
  { id: 'iso_max', label: 'Max ISO (native)', group: 'Photo', kind: 'number', unit: '', range: [1600, 1e7], definition: 'The highest native (standard, not expanded) ISO for stills.', input: '{"n": 51200}', score: (v) => Math.log2(v) },
  { id: 'iso_ext', label: 'Max ISO (with expansion)', group: 'Photo', kind: 'number', unit: '', range: [1600, 1e8], definition: 'The highest ISO selectable for stills, expanded/extended/boosted settings included. When the camera has no expanded range above its native maximum, that maximum.', input: '{"n": 204800}' },
  { id: 'still_res', label: 'Max still resolution', group: 'Photo', kind: 'dims', definition: 'The largest still image size in pixels (width × height), from the sensor (not pixel-shift composites).', input: '{"w": 7008, "h": 4672, "unit": "px"}' },
  { id: 'shutter_mech', label: 'Fastest shutter (mechanical)', group: 'Photo', kind: 'shutter', definition: 'The fastest speed of the mechanical shutter (or mechanical with electronic first curtain). "None" when the camera has no mechanical shutter.', input: '"1/8000" | "None"' },
  { id: 'shutter_elec', label: 'Fastest shutter (electronic)', group: 'Photo', kind: 'shutter', definition: 'The fastest speed of the fully electronic shutter, for stills. Never an electronic front-curtain figure.', input: '"1/16000"', score: (v) => (typeof v === 'number' ? Math.log2(1 / v) : null) },
  { id: 'shutter_min', label: 'Slowest shutter', group: 'Photo', kind: 'shutter', definition: 'The slowest timed shutter speed (not bulb or time limits).', input: '"30" (seconds) | "1800" (30 minutes)' },
  { id: 'burst', label: 'Max burst', group: 'Photo', kind: 'number', unit: 'fps', range: [1, 500], definition: 'The fastest continuous shooting at full resolution, any shutter (pre-capture included if at full resolution).', input: '{"n": 30}', score: (v) => v },
  { id: 'raw_bits', label: 'RAW bit depth', group: 'Photo', kind: 'number', unit: '-bit', range: [10, 16], definition: 'The bit depth of still RAW files (not video).', input: '{"n": 14}' },
  { id: 'still_formats', label: 'Still file formats', group: 'Photo', kind: 'set', options: STILLS, definition: 'Still image file formats it records.', input: '["RAW", "JPEG", "HEIF"]' },
  { id: 'video_modes', label: 'Movie capture formats', group: 'Video', kind: 'modes', definition: 'Each internal recording frame size with its frame rates (not HDMI output, streaming or proxy sizes). Rates as stated (23.98, 59.94 are fine).', input: '[{"w": 3840, "h": 2160, "fps": [23.98, 29.97, 59.94, 119.88]}, {"w": 1920, "h": 1080, "fps": [240]}]' },
  { id: 'video_max', label: 'Max movie resolution', group: 'Video', kind: 'level', definition: 'Derived: the largest agreed frame size at its fastest agreed rate.', input: '(derived, do not submit)' },
  { id: 'video_formats', label: 'Recording formats', group: 'Video', kind: 'set', options: CODECS, definition: 'Internal video codecs (not containers such as MP4 or MOV, not compression modes such as Long GOP or All-Intra, not codecs only available over HDMI to an external recorder).', input: `subset of ${CODECS.join(', ')}` },
  { id: 'video_bits', label: 'Video bit depth', group: 'Video', kind: 'number', unit: '-bit', range: [8, 16], definition: 'The highest internal video bit depth (RAW video included).', input: '{"n": 10}', score: (v) => v },
  { id: 'slots', label: 'Card slots', group: 'Storage', kind: 'slots', options: CARDS, definition: 'One entry per card slot, each with every card type it takes.', input: '[["CFexpress Type A", "SD UHS-II"], ["SD UHS-II"]]', score: (v) => v.length + v.flat().filter((c: string) => /CFexpress|XQD|CFast/.test(c)).length * 0.5 },
  { id: 'wifi', label: 'Wi-Fi', group: 'Connectivity', kind: 'level', options: WIFI, definition: 'Built-in Wi-Fi and its standard (802.11ax = Wi-Fi 6, ac = Wi-Fi 5, n = Wi-Fi 4). "Yes" when present but the standard is not stated; "No" when stated absent.', input: '"Wi-Fi 6" | "Yes" | "No"' },
  { id: 'bluetooth', label: 'Bluetooth', group: 'Connectivity', kind: 'level', options: BT, definition: 'Built-in Bluetooth and its version; "Yes" when the version is not stated; "No" when stated absent.', input: '"5.3" | "Yes" | "No"' },
  { id: 'gps', label: 'GPS (built-in)', group: 'Connectivity', kind: 'bool', definition: 'Whether a GPS receiver is built in. Location from a connected phone app is false.', input: 'true | false' },
  { id: 'ports', label: 'Ports', group: 'Connectivity', kind: 'set', options: PORTS, definition: 'Physical connectors on the body.', input: `subset of ${PORTS.join(', ')}` },
  { id: 'webcam', label: 'UVC/UAC webcam', group: 'Connectivity', kind: 'bool', definition: 'Whether it works as a standard USB webcam (UVC/UAC) without extra software.', input: 'true | false' },
  { id: 'webcam_res', label: 'UVC/UAC max resolution', group: 'Connectivity', kind: 'modes', na: { when: 'webcam', is: false, because: 'not a USB webcam' }, definition: 'The best frame size and rate it streams as a USB webcam.', input: '[{"w": 3840, "h": 2160, "fps": [30]}]' },
];
export const SPEC: Record<string, Spec> = Object.fromEntries(SPECS.map((s) => [s.id, s]));
export const READABLE = SPECS.filter((s) => s.id !== 'video_max');

// ---- Normalising a reader's value to the standard, or saying why it is not one.
const NOMINAL = [23.976, 29.97, 47.952, 59.94, 119.88, 239.76];
export const rate = (f: number) => (NOMINAL.some((x) => Math.abs(f - x) < 0.06) ? Math.round(f) : Math.round(f * 100) / 100);
const n = (x: any) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && !isNaN(Number(x.replace(/,/g, ''))) ? Number(x.replace(/,/g, '')) : NaN);
const sec = (x: any): number | null => {
  const s = String(x ?? '').trim();
  const f = s.match(/^1\s*\/\s*([\d,]+(?:\.\d+)?)\s*s?$/);
  if (f) return 1 / n(f[1]);
  const m = s.match(/^([\d.]+)\s*(min|minutes?)$/i);
  if (m) return n(m[1]) * 60;
  const v = n(s.replace(/\s*(s|sec|seconds?)$/i, ''));
  return isNaN(v) ? null : v;
};
export type Normal = { ok: true; value: any } | { ok: false; why: string };
const bad = (why: string): Normal => ({ ok: false, why });
export function normalise(id: string, raw: any): Normal {
  const s = SPEC[id];
  if (!s || id === 'video_max') return bad('not a spec to submit');
  const pick = (v: string, list: string[]) => list.find((o) => o.toLowerCase() === String(v).trim().toLowerCase());
  switch (s.kind) {
    case 'enum': { const v = pick(raw, s.options!); return v ? { ok: true, value: v } : bad(`one of: ${s.options!.join(', ')}`); }
    case 'level': { const v = pick(raw, s.options!); return v ? { ok: true, value: v } : bad(`one of: ${s.options!.join(', ')}`); }
    case 'bool': return typeof raw === 'boolean' ? { ok: true, value: raw } : bad('true or false');
    case 'text': { const v = String(raw ?? '').trim().replace(/[\u2010-\u2015\u2212]/g, '-'); return /^[A-Z0-9][A-Za-z0-9.-]{2,20}$/.test(v) ? { ok: true, value: v.replace(/^(EN-EL\d+)([A-Z]*)$/i, (_x, a, b) => a.toUpperCase() + b.toLowerCase()).replace(/^(?!EN-EL)(.*)$/, (x) => x.toUpperCase()) } : bad('the model code, e.g. "NP-FZ100"'); }
    case 'date': { const v = String(raw ?? '').trim(); return /^(19|20)\d\d-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(v) ? { ok: true, value: v } : bad('"YYYY-MM-DD" or "YYYY-MM"'); }
    case 'money': {
      if (raw?.currency && String(raw.currency).toUpperCase() !== 'USD') return bad('US dollars only');
      const v = n(raw?.n ?? raw);
      return v > 100 && v < 100000 ? { ok: true, value: Math.round(v * 100) / 100 } : bad('{"n": 2199, "currency": "USD"}');
    }
    case 'number': {
      const unit = String(raw?.unit ?? s.unit ?? '').trim().toLowerCase().replace(/^m$/, 'million').replace(/^mio\.?$/, 'million');
      const k = s.units ? s.units[unit] ?? (unit === (s.unit || '').toLowerCase() || unit === '' ? 1 : undefined) : 1;
      if (k === undefined) return bad(`unit one of: ${Object.keys(s.units!).join(', ')}`);
      const v = n(raw?.n ?? raw) * k;
      const r = s.unit === 'in' ? Math.round(v * 100) / 100 : s.units === dots ? Math.round(v) : k !== 1 ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000;
      return !isNaN(v) && (!s.range || (v >= s.range[0] && v <= s.range[1])) ? { ok: true, value: r } : bad(`a number of ${s.unit}${s.range ? ` between ${s.range[0]} and ${s.range[1]}` : ''}`);
    }
    case 'shutter': {
      if (/^\s*none\b/i.test(String(raw)) && id === 'shutter_mech') return { ok: true, value: 'None' };
      const v = sec(raw);
      if (v === null) return bad('"1/8000" or seconds like "30"');
      if (id === 'shutter_min' ? v < 1 || v > 3600 : v > 0.01 || v < 1e-6) return bad(id === 'shutter_min' ? 'seconds between 1 and 3600' : 'a fast speed like "1/8000"');
      return { ok: true, value: v };
    }
    case 'dims': {
      const k = id === 'still_res' ? 1 : mm[String(raw?.unit ?? 'mm').toLowerCase() as keyof typeof mm];
      if (!k) return bad('unit mm, cm or in');
      const [w, h, d] = [n(raw?.w) * k, n(raw?.h) * k, n(raw?.d) * k].map((x) => Math.round(x * 10) / 10);
      if (id === 'still_res') return w > 1000 && h > 700 ? { ok: true, value: { w: Math.round(w), h: Math.round(h) } } : bad('{"w": 7008, "h": 4672}');
      return [w, h, d].every((x) => x > 20 && x < 400) ? { ok: true, value: { w, h, d, tol: k === 25.4 ? 1.3 : k === 10 ? 0.5 : 0.1 } } : bad('{"w", "h", "d"} in mm, cm or in');
    }
    case 'sensor': {
      const f = pick(raw?.format, s.options!);
      if (!f) return bad(`format one of: ${s.options!.join(', ')}`);
      const w = n(raw?.w), h = n(raw?.h);
      return { ok: true, value: { format: f, ...(w > 5 && h > 3 ? { w, h } : {}) } };
    }
    case 'modes': {
      if (!Array.isArray(raw) || !raw.length) return bad('a list like [{"w": 3840, "h": 2160, "fps": [30, 60]}]');
      const out: Array<{ w: number; h: number; fps: number[] }> = [];
      for (const m of raw) {
        const w = n(m?.w), h = n(m?.h), fps = [m?.fps].flat().map(n).filter((f: number) => f > 0 && f <= 2000).map(rate);
        if (!(w >= 320 && w <= 20000 && h >= 240 && h <= 12000) || !fps.length) return bad('each {"w", "h", "fps": [...]} with pixel sizes and rates');
        const p = out.find((o) => o.w === w && o.h === h);
        if (p) p.fps = [...new Set([...p.fps, ...fps])].sort((a, b) => a - b); else out.push({ w, h, fps: [...new Set(fps)].sort((a, b) => a - b) });
      }
      return { ok: true, value: out };
    }
    case 'set': {
      const list = [raw].flat().map((x: any) => pick(x, s.options!));
      return list.length && list.every(Boolean) ? { ok: true, value: [...new Set(list as string[])] } : bad(`a list from: ${s.options!.join(', ')}`);
    }
    case 'slots': {
      const list = [raw].flat().map((sl: any) => [sl].flat().map((c: any) => pick(c, s.options!)));
      return list.length && list.length <= 4 && list.every((sl) => sl.length && sl.every(Boolean)) ? { ok: true, value: list.map((sl) => [...new Set(sl as string[])]) } : bad(`one list per slot of: ${s.options!.join(', ')}`);
    }
  }
  return bad('unknown');
}

// ---- Comparing two standard values: do they say the same thing?
const decimals = (x: number) => (String(x).split('.')[1] || '').length;
const sameNum = (a: number, b: number, rel = 0) => {
  if (rel && Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b))) return true;
  const p = Math.min(decimals(a), decimals(b));
  return Math.round(a * 10 ** p) === Math.round(b * 10 ** p);
};
// A card name less specific than another ("SD" in "SD UHS-II") is compatible with it.
const fits = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
export function same(id: string, a: any, b: any): boolean {
  const s = SPEC[id];
  switch (s.kind) {
    case 'number': return sameNum(a, b, s.rel || 0);
    case 'money': return sameNum(a, b, 0.02);
    case 'shutter': return typeof a === 'string' || typeof b === 'string' ? a === b : Math.abs(Math.log(a / b)) < 0.05;
    case 'date': { const k = Math.min(a.length, b.length); return a.slice(0, k) === b.slice(0, k); }
    case 'level': return a === b || (a === 'Yes' && b !== 'No') || (b === 'Yes' && a !== 'No') || [a, b].sort().join() === 'Wi-Fi 6,Wi-Fi 6E';
    case 'dims': return id === 'still_res' ? Math.abs(a.w - b.w) <= 16 && Math.abs(a.h - b.h) <= 16 : ['w', 'h', 'd'].every((k) => Math.abs(a[k] - b[k]) <= Math.max(1.05, (a.tol || 0) + (b.tol || 0)));
    case 'sensor': return a.format === b.format && (!a.w || !b.w || (Math.abs(a.w - b.w) <= 0.3 && Math.abs(a.h - b.h) <= 0.3));
    case 'slots': return a.length === b.length && a.every((sl: string[], i: number) => fits(sl, b[i]) || b.some((x: string[]) => fits(sl, x)));
    default: return JSON.stringify(a) === JSON.stringify(b);
  }
}
// Of two values that agree, the more precise one is shown ("Wi-Fi 6" over "Yes", 35.9 × 23.9 over none).
export const detail = (id: string, v: any) => (SPEC[id].kind === 'level' ? (v === 'Yes' ? 0 : v === 'Wi-Fi 6E' ? 2 : 1) : JSON.stringify(v).length);

// ---- Showing a value. A list is in one order for every camera, so comparing them lines up: the dictionary's
// own order for named things (formats, ports, cards), the largest first for movie modes.
export function order(id: string, v: any[]) {
  const s = SPEC[id];
  if (s.kind === 'modes') return [...v].sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
  if (s.options) return [...v].sort((a, b) => s.options!.indexOf(a) - s.options!.indexOf(b));
  return v;
}

const shutterText = (v: number | string) => (typeof v === 'string' ? `${v} (electronic shutter only)` : v < 1 ? `1/${Math.round(1 / v)} s` : `${Math.round(v * 10) / 10} s`);
export const modeClass = (w: number, h: number) => (w >= 7600 && w <= 7700 && h <= 4400 ? '8K UHD' : w >= 4090 && w <= 4100 && h <= 2200 ? 'DCI 4K' : w >= 3830 && w <= 3850 && h <= 2200 ? 'UHD 4K' : w >= 1900 && w <= 1930 && h <= 1100 ? 'Full HD' : w >= 1270 && w <= 1290 ? 'HD' : `${Number((w / 1000).toFixed(1))}K`);
export const modeText = (m: { w: number; h: number; fps: number[] }) => `${modeClass(m.w, m.h)} (${m.w}×${m.h}) @ ${m.fps.map((f) => `${f}p`).join('/')}`;
export function text(id: string, v: any): string {
  if (v === 'n/a') return 'Not applicable';
  const s = SPEC[id];
  switch (s.kind) {
    case 'bool': return v ? 'Yes' : 'No';
    case 'number': return s.unit === 'dots' ? `${(v / 1e6).toFixed(2)}M dots` : s.unit === 'in' ? `${v}″` : `${v.toLocaleString('en-US')}${s.unit ? (s.unit.startsWith('-') || s.unit === '×' ? s.unit : ` ${s.unit}`) : ''}`;
    case 'money': return `$${v.toLocaleString('en-US')}`;
    case 'shutter': return shutterText(v);
    case 'dims': return id === 'still_res' ? `${v.w} × ${v.h}` : `${v.w} × ${v.h} × ${v.d} mm`;
    case 'sensor': return `${v.format}${v.w ? ` (${v.w} × ${v.h} mm)` : ''}`;
    case 'modes': return order(id, v).map(modeText).join('\n');
    case 'set': return order(id, v).join('\n');
    case 'slots': return v.map((sl: string[]) => order(id, sl).join(' / ')).join('\n');
    case 'level': return id === 'bluetooth' && /^\d/.test(v) ? `Yes, ${v}` : v;
    default: return String(v);
  }
}
// Figures a quote must contain for a value to be taken from it (as written on a page: 3.69 million, 1/8000).
export function figures(id: string, raw: any): number[] {
  const s = SPEC[id];
  if (['number', 'money'].includes(s.kind)) return [n(raw?.n ?? raw)].filter((x) => !isNaN(x));
  if (s.kind === 'shutter') { const m = String(raw).match(/[\d,.]+/g); return (m || []).map(n).filter((x) => x > 1).map((x) => (/min/i.test(String(raw)) ? x : x)); }
  if (s.kind === 'dims') return [raw?.w, raw?.h, raw?.d].map(n).filter((x) => !isNaN(x));
  return [];
}
