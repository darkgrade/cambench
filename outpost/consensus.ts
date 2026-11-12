// Consensus: readings become facts. Each page's reading is its source's word; a source's owner is who stands
// behind it (a maker's sites are one owner, a page that repeats another's wording is that page's owner again).
// Readings an adjudicator judged an error or another measure are set aside. For each spec the values that
// agree (by the dictionary's own comparison) are grouped and the group most independent owners stand behind
// is the fact: verified with three or more. A spec that cannot apply is settled by the one it depends on;
// prices are dated quotes from named sellers. Nothing here reads a page's text: only what readers recorded.
import { createHash } from 'node:crypto';
import { SPEC, SPECS, same, detail, text, order, VERSION, modeClass } from './dictionary.ts';
import * as P from './pipeline.ts';
import { levelOf } from './level.ts';

export const NEED = 3;
export interface Evidence { spec: string; source: string; owner: string; url: string; at: string; value: any; raw: string; label: string; page: number; sha: string }
export interface Fact { spec: string; value: any; text: string; status: 'verified' | 'likely' | 'single' | 'disputed' | 'quote'; owners: string[]; evidence: Evidence[]; conflicts: Evidence[]; items?: Array<{ text: string; owners: string[]; status: string }> }
const status = (n: number, contested = false): Fact['status'] => (n >= NEED ? 'verified' : contested ? 'disputed' : n === 2 ? 'likely' : 'single');
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const quoteKey = (t: string) => String(t).toLowerCase().replace(/[^a-z0-9.,/]+/g, ' ').trim();

// Every reading for one camera, as evidence, with its owner (copies resolved).
export function evidenceOf(run: number, c: any) {
  const pages = P.pagesOf(run, c.id);
  const ev: Evidence[] = [];
  for (const p of pages) {
    const s = P.readKey(p), front = P.readPage(p.file).front;
    for (const r of P.db.prepare('SELECT spec, value, quote, note FROM readings WHERE sha = ? AND version = ?').all(s, VERSION) as any[])
      ev.push({ spec: r.spec, source: p.source, owner: P.ownerOf(p.source, c.brand, p.url), url: p.url, at: front.scraped_at || p.scraped_at, value: JSON.parse(r.value), raw: r.quote, label: r.note ? `Read by agent · ${r.note}` : 'Read by agent', page: p.id, sha: s });
  }
  // A page that repeats another's wording reading for reading (8 or more, 60% or more alike) is that page's
  // owner again: Adorama's sheet is B&H's. The more trusted page keeps its name.
  const byPage = new Map<number, Evidence[]>();
  for (const e of ev) byPage.set(e.page, [...(byPage.get(e.page) || []), e]);
  const rank = (o: string) => (o === c.brand ? 0 : o === 'B&H' ? 1 : 2);
  const list = [...byPage.values()].sort((a, b) => rank(a[0].owner) - rank(b[0].owner));
  const copies: Record<string, string> = {};
  for (const [i, a] of list.entries()) for (const b of list.slice(i + 1)) {
    if (a[0].owner === b[0].owner || copies[b[0].owner]) continue;
    const A = new Set(a.map((e) => quoteKey(e.raw)).filter((q) => q.length >= 4)), B = b.map((e) => quoteKey(e.raw)).filter((q) => q.length >= 4);
    const small = Math.min(A.size, B.length);
    if (small >= 8 && B.filter((q) => A.has(q)).length / small >= 0.6) copies[b[0].owner] = a[0].owner;
  }
  for (const e of ev) if (copies[e.owner]) e.owner = copies[e.owner];
  // Adjudicated readings: an error or another measure is set aside (its note kept for the reader).
  const verdicts = new Map((P.db.prepare('SELECT sha, spec, verdict FROM verdicts WHERE camera = ?').all(c.id) as any[]).map((v) => [`${v.sha}|${v.spec}`, v.verdict]));
  const kept = ev.filter((e) => !['error', 'other'].includes(verdicts.get(`${e.sha}|${e.spec}`) || ''));
  return { evidence: kept, all: ev, copies, pages };
}

export function factsForCamera(run: number, c: any) {
  const { evidence, copies, pages } = evidenceOf(run, c);
  const facts: Record<string, Fact> = {};
  const by = new Map<string, Evidence[]>();
  for (const e of evidence) by.set(e.spec, [...(by.get(e.spec) || []), e]);
  for (const s of SPECS) {
    if (s.id === 'video_max') continue;
    const ev = by.get(s.id) || [];
    if (!ev.length) continue;
    if (s.quote) { facts[s.id] = quote(s.id, ev); continue; }
    if (s.kind === 'set' || s.kind === 'modes') { facts[s.id] = items(s.id, ev); continue; }
    facts[s.id] = one(s.id, ev, c.brand);
  }
  // What cannot apply, once what it depends on is settled.
  for (const s of SPECS) if (s.na && facts[s.na.when]?.status === 'verified' && JSON.stringify(facts[s.na.when].value) === JSON.stringify(s.na.is))
    facts[s.id] = { spec: s.id, value: 'n/a', text: `Not applicable (${s.na.because})`, status: 'verified', owners: facts[s.na.when].owners, evidence: [], conflicts: [] };
  // The highest selectable ISO: where no source gives an expanded figure above the verified native maximum,
  // the native maximum is it (the SL3-P's range is 50 to 200,000, with nothing beyond).
  if (facts.iso_max?.status === 'verified' && facts.iso_ext && !by.get('iso_ext')!.some((e) => e.value > facts.iso_max.value))
    facts.iso_ext = { ...facts.iso_max, spec: 'iso_ext', text: text('iso_ext', facts.iso_max.value), evidence: [...facts.iso_ext.evidence, ...facts.iso_max.evidence] };
  // The largest agreed movie mode at its fastest agreed rate.
  const vm = facts.video_modes;
  if (vm?.value?.length) {
    const best = [...vm.value].sort((a: any, b: any) => b.w * b.h - a.w * a.h || Math.max(...b.fps) - Math.max(...a.fps))[0];
    facts.video_max = { spec: 'video_max', value: { ...best, fps: [Math.max(...best.fps)] }, text: `${modeClass(best.w, best.h)} (${best.w}×${best.h}) @ ${Math.max(...best.fps)}p`, status: vm.status, owners: vm.owners, evidence: vm.evidence, conflicts: [] };
  }
  // Prices from the retailers' own pages (B&H's price and used price, eBay's listings, MPB), as quotes too.
  for (const p of pages) for (const x of P.priceQuotes(p.source, P.readPage(p.file).markdown, { ...c, url: p.url })) {
    const e: Evidence = { spec: x.spec, source: p.source, owner: P.ownerOf(p.source, c.brand, p.url), url: p.url, at: P.readPage(p.file).front.scraped_at || p.scraped_at, value: x.value, raw: x.raw, label: x.label, page: p.id, sha: '' };
    const f = facts[x.spec];
    const all = [...(f?.evidence || []), e];
    facts[x.spec] = quote(x.spec, all);
  }
  // Pictures to try: the pages' product shots, front and back (the pictures step checks them).
  const imgs = pages.flatMap((p) => P.imagesOf(p.source, P.readPage(p.file).markdown)).sort((a: any, b: any) => b.score - a.score);
  for (const side of ['front', 'back']) {
    const cands = [...imgs.filter((x: any) => x.side === side && x.source !== 'bh'), ...imgs.filter((x: any) => x.side === 'unknown' && x.source === 'dpreview' && side === 'front')];
    if (cands.length) facts[`image_${side}`] = { spec: `image_${side}`, value: { url: cands[0].url, candidates: cands.slice(0, 6) }, text: cands[0].url, status: 'single', owners: [], evidence: [], conflicts: [] };
  }
  Object.defineProperty(facts, 'copies', { value: copies, enumerable: false });
  return facts;
}

// One value: the group of agreeing values most independent owners stand behind.
function one(id: string, ev: Evidence[], brand: string): Fact {
  // One word per owner: its most common value (its maker page first when an owner has several pages).
  const per = new Map<string, Evidence[]>();
  for (const e of ev) per.set(e.owner, [...(per.get(e.owner) || []), e]);
  const owners = [...per.values()].map((es) => {
    const groups: Evidence[][] = [];
    for (const e of es) { const g = groups.find((x) => same(id, x[0].value, e.value)); if (g) g.push(e); else groups.push([e]); }
    return groups.sort((a, b) => b.length - a.length)[0][0];
  });
  const groups: Evidence[][] = [];
  for (const e of owners) { const g = groups.find((x) => x.some((y) => same(id, y.value, e.value))); if (g) g.push(e); else groups.push([e]); }
  const trusted = (g: Evidence[]) => g.some((e) => e.owner === brand || e.owner === 'B&H');
  groups.sort((a, b) => b.length - a.length || Number(trusted(b)) - Number(trusted(a)));
  const top = groups[0];
  const rep = [...top].sort((a, b) => detail(id, b.value) - detail(id, a.value))[0];
  const contested = groups.length > 1 && groups[1].length >= top.length;
  const evidence = ev.filter((e) => top.some((t) => same(id, t.value, e.value)) && top.some((t) => t.owner === e.owner));
  return { spec: id, value: rep.value, text: text(id, rep.value), status: status(top.length, contested), owners: top.map((e) => e.owner), evidence, conflicts: ev.filter((e) => !evidence.includes(e)) };
}

// A list (formats, ports, movie modes): each item counted on its own; the row shows what three or more
// owners give (else two, else one), each item keeping its count.
function items(id: string, ev: Evidence[]): Fact {
  const s = SPEC[id], key = (x: any) => (s.kind === 'modes' ? `${x.w}x${x.h}` : String(x));
  const counts = new Map<string, { v: any; owners: Set<string>; rates: Map<number, Set<string>> }>();
  for (const e of ev) for (const x of e.value as any[]) {
    if (s.options && !s.options.includes(x)) continue;
    const k = key(x);
    const it = counts.get(k) || { v: s.kind === 'modes' ? { w: x.w, h: x.h, fps: [] } : x, owners: new Set(), rates: new Map() };
    it.owners.add(e.owner);
    if (s.kind === 'modes') for (const f of x.fps) it.rates.set(f, (it.rates.get(f) || new Set()).add(e.owner));
    counts.set(k, it);
  }
  const all = [...counts.values()].sort((a, b) => b.owners.size - a.owners.size);
  const best = all[0]?.owners.size || 0;
  const floor = best >= NEED ? NEED : best >= 2 ? 2 : 1;
  const kept = all.filter((i) => i.owners.size >= floor).map((i) => {
    if (s.kind !== 'modes') return i.v;
    const top = Math.max(...[...i.rates.values()].map((o) => o.size));
    const need = Math.min(top, floor);
    return { ...i.v, fps: [...i.rates].filter(([, o]) => o.size >= need).map(([f]) => f).sort((a, b) => a - b) };
  });
  const sorted = order(id, kept);
  const owners = [...new Set(all.filter((i) => i.owners.size >= floor).flatMap((i) => [...i.owners]))];
  return { spec: id, value: sorted, text: text(id, sorted), status: status(floor), owners, evidence: ev, conflicts: [],
    items: [...all].sort((a, b) => { const o = order(id, [a.v, b.v]); return o[0] === a.v ? -1 : 1; }).map((i) => ({ text: s.kind === 'modes' ? text(id, [{ ...i.v, fps: [...i.rates.keys()].sort((a, b) => a - b) }]) : String(i.v), owners: [...i.owners], status: status(i.owners.size) })) };
}

// A price: the median of the sellers' quotes, each kept with its date.
function quote(id: string, ev: Evidence[]): Fact {
  const per = [...new Map(ev.map((e) => [e.owner, e])).values()];
  const vals = per.map((e) => e.value).sort((a, b) => a - b), mid = vals[Math.floor((vals.length - 1) / 2)];
  const v = Math.round(id === 'price_used' ? vals.reduce((a, b) => a + b, 0) / vals.length : mid);
  return { spec: id, value: v, text: `$${v.toLocaleString('en-US')}`, status: 'quote', owners: per.map((e) => e.owner), evidence: per, conflicts: [] };
}

// Spec level: fixed, weighted scales per area, with reasons (level.ts).
export function specLevels(cams: Array<{ id: string; facts: Record<string, Fact> }>) {
  return cams.map((c) => ({ id: c.id, ...levelOf(c.facts) }));
}
export const conflictKey = (ev: Evidence[]) => sha(ev.map((e) => `${e.sha}:${JSON.stringify(e.value)}`).sort().join('|'));
