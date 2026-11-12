// Camera identity and page text: one key for "Canon EOS R8 Mark II", "Canon R8 Mk II" and "R8 Mk.II" (and
// a maker's model codes, ILCE-7M5, DC-S1M2ES), a clean display name, and an archived spec sheet's plain text
// written out as Markdown tables (Adorama via the Wayback Machine, Wex). What specs a page states is read by
// agents against the dictionary (dictionary.ts, reads.ts), never by patterns here.
export interface Source { key: string; title: string; owner: string; trusted: boolean }
// ---- Camera identity.
export const BRANDS: Record<string, RegExp> = {
  Canon: /\bcanon\b/i, Nikon: /\bnikon\b/i, Sony: /\bsony\b/i, Panasonic: /\b(panasonic|lumix)\b/i, Fujifilm: /\bfuji(film)?\b/i,
  Leica: /\bleica\b/i, Sigma: /\bsigma\b/i, Hasselblad: /\bhasselblad\b/i, Pixii: /\bpixii\b/i, 'OM System': /\b(om system|om digital|olympus)\b/i,
  Pentax: /\b(pentax|ricoh)\b/i, Blackmagic: /\bblackmagic\b/i, RED: /\bred digital\b/i, Zeiss: /\bzeiss\b/i,
};
export const brandOf = (s: string) => Object.keys(BRANDS).find((b) => BRANDS[b].test(s)) || '';
const ROMAN: Record<string, string> = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi', '7': 'vii', '8': 'viii' };
// Words that describe a listing, never the camera: "Mirrorless Camera", "Body Only", "(Black)", a kit.
const NOISE = /\b(digital|dslr|rangefinder|mirrorless|interchangeable[- ]lens|system|full[- ]frame|camera|cameras|body|only|kit|black|silver|white|charcoal|graphite|bundle|basic|essentials\+?|with .*$|w\/.*$|international version)\b/gi;
// Sony's and Panasonic's model codes as their names: ILCE-7M5 is the a7 V, DC-S1RM2 the S1R II.
function codes(s: string) {
  return s
    .replace(/\bilce-?(\d)([a-z]*)m(\d)\b/gi, (_m, n, x, v) => `a${n}${x} ${ROMAN[v] || v}`)
    .replace(/\bilce-?(\d)([a-z]*)\b/gi, (_m, n, x) => `a${n}${x}`)
    .replace(/\bdc-?(s\d[a-z]*)m(\d)(e|x)?s?\b/gi, (_m, n, v, e) => `${n} ${ROMAN[v] || v}${e || ''}`)
    .replace(/\bdc-?(s\d[a-z]*|g\d+|gh\d[a-z]*)\b/gi, '$1');
}
// A listing's title down to its model: everything from the first word that describes the listing
// (Mirrorless, Camera, a kit, a colour in brackets, a firmware edition, refurbished) is dropped.
export const modelOf = (name: string) => String(name).split(/\s(?=(?:mirrorless|dslr|digital|rangefinder|medium[- ]format|cinema|camera|cameras|with|w\/|and|\+|body|kit|bundle|refurbished|open[- ]box|used|international|[-–—|]|\())\b|\s\(|\s[-–—|]\s/i)[0].trim();
// The key: brand, then the model's letters and numbers with every space, dot and dash gone and any
// generation as a roman numeral ("Mark II", "Mk.II", "MkII", "M2" after a model all read "ii").
export function cameraKey(name: string, brand = brandOf(name)): string {
  let s = codes(modelOf(String(name).replace(/[α]/g, 'a')).replace(/\(([^)]*)\)/g, ' '));
  for (const re of Object.values(BRANDS)) s = s.replace(new RegExp(re.source, 'gi'), ' ');
  s = s.replace(NOISE, ' ').replace(/\b(eos|lumix|alpha|nikkor)\b/gi, ' ');
  s = s.replace(/(\d)(mark|mk)/gi, '$1 $2').replace(/\bmark\s*\.?\s*|\bmk\s*\.?\s*/gi, ' mk');
  s = s.replace(/\bmk\s*(\d)\b/gi, (_m, v) => ` ${ROMAN[v] || v}`).replace(/\bmk\s*(i{1,3}|iv|v|vi{0,3})\b/gi, ' $1');
  s = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
  return `${brand.toLowerCase().replace(/\s+/g, '-') || 'unknown'}:${s.replace(/\s+/g, '')}`;
}
// A clean display name: the brand, then the model as most sources print it, "Mark II" in full for Canon.
export function displayName(names: string[], brand: string) {
  const cleaned = names.map((n) => codes(modelOf(n)).replace(/\([^)]*\)/g, ' ').replace(new RegExp(BRANDS[brand]?.source || '^$', 'gi'), ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const count = new Map<string, number>();
  for (const c of cleaned) count.set(c, (count.get(c) || 0) + 1);
  let best = [...count].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || '';
  best = best.replace(/\bmk\.?\s*(ii|iii|iv|v)\b/gi, (_m, v) => `Mark ${v.toUpperCase()}`);
  best = best.replace(/[\s:;,.–—-]+$/, '');
  return `${brand}${brand === 'Panasonic' ? ' Lumix' : ''} ${best}`.trim();
}

// Adorama's spec sheet as the Wayback Machine returns it: plain text, each section's name followed by
// "Jump to...", then a label line and its value line(s). Written out as Markdown tables, so it is saved
// and read like every other page. A line with no figure and no colon starts the next label.
export function flatSpecs(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const from = lines.findIndex((l) => /specifications$/i.test(l.replace(/^#+\s*/, '')));
  const to = lines.findIndex((l, i) => i > from && /^(accessories for|view more information)$/i.test(l));
  const body = lines.slice(from < 0 ? 0 : from + 1, to < 0 ? undefined : to);
  const out: string[] = [];
  const labelLike = (l: string) => !/\d|:/.test(l) && l.length <= 48 && /^[A-Z]/.test(l);
  let label = '', value: string[] = [];
  const flush = () => {
    if (label && value.length) out.push(`| ${label.replace(/\|/g, '/')} | ${value.join('<br>').replace(/\|/g, '/')} |`);
    label = '';
    value = [];
  };
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if (body[i + 1] === 'Jump to...') {
      flush();
      out.push('', `### ${l}`, '', '| | |', '| --- | --- |');
      i++;
      continue;
    }
    if (l === 'Jump to...') continue;
    if (!label) label = l;
    else if (!value.length || !labelLike(l)) value.push(l);
    else { flush(); label = l; }
  }
  flush();
  return out.join('\n');
}

