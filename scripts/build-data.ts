/**
 * Joins the published results into the files the overview's views load (public/data/, fetched on first
 * use) and the few small tallies they bundle (src/facts.json for the story's captions, src/agreement.json
 * for the Sources view, src/bodies.json for the Atlas and the line-up). Also cuts each front picture down
 * to its body and saves it small, so no view loads the full-size pictures. Runs before `vite` and
 * `vite build`; nothing it writes is committed.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SOURCE_GROUPS, sourceGroup } from '@site/sources'
import sharp from 'sharp'

interface Evidence {
    source: string
    owner: string
    url: string
    raw: string
    value: unknown
}

interface Fact {
    value: unknown
    text: string | null
    status: 'verified' | 'likely' | 'single' | 'disputed' | 'quote'
    owners: string[]
    evidence: Evidence[]
    conflicts: Evidence[]
}

interface Camera {
    slug: string
    name: string
    brand: string
    level: { level: number | null; coverage: number; reasons: { area: string; weight: number; score: number }[] }
    image: { front?: string }
    facts: Record<string, Fact>
}

interface Summary {
    slug: string
    level: number | null
}

const ROOT = resolve(import.meta.dirname, '..')
const DATA = join(ROOT, 'public', 'data')
const read = <T>(...path: string[]): T => JSON.parse(readFileSync(join(ROOT, ...path), 'utf8')) as T
const write = (path: string[], value: unknown): void => {
    mkdirSync(join(ROOT, ...path.slice(0, -1)), { recursive: true })
    writeFileSync(join(ROOT, ...path), `${JSON.stringify(value)}\n`)
}
const median = (values: number[]): number => {
    const sorted = [...values].sort((first, second) => first - second)
    return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
}
const clip = (text: string, length: number): string => (text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text)

const results = read<{ specs: { id: string; label: string; group: string }[]; cameras: Summary[] }>('results', 'cambench.json')
// Best spec level first: the order the site lists cameras in (src/data.ts).
const summaries = [...results.cameras].sort((first, second) => (second.level ?? -1) - (first.level ?? -1))
const cameras = summaries.map(summary => read<Camera>('results', 'cameras', `${summary.slug}.json`))
const specs = results.specs

const GROUPS = SOURCE_GROUPS
const brands = new Set(cameras.map(camera => camera.brand))
const newsOwners = new Set(cameras.flatMap(camera => Object.values(camera.facts).flatMap(fact => [...fact.evidence, ...fact.conflicts].filter(item => item.source === 'news').map(item => item.owner))))
const groupOf = (item: Evidence): number => sourceGroup(item.owner, brands.has(item.owner), newsOwners.has(item.owner))

/** How a reading stands: the order of the story's palette. */
const STANDING = { verified: 0, likely: 1, single: 2, differs: 3, unsettled: 4, price: 5 } as const

function standingOf(fact: Fact, conflict: boolean): number {
    if (fact.status === 'quote') return STANDING.price
    if (fact.status === 'disputed') return STANDING.unsettled
    if (conflict) return STANDING.differs
    return STANDING[fact.status]
}

const owners: string[] = []
const ownerIndexes = new Map<string, number>()
function ownerIndex(name: string): number {
    if (!ownerIndexes.has(name)) {
        ownerIndexes.set(name, owners.length)
        owners.push(name)
    }
    return ownerIndexes.get(name)!
}

/** One fact's readings, each with the value it states numbered: 0 is the listed value, 1 and up the others. */
function sides(fact: Fact): { item: Evidence; variant: number; group: number }[] {
    const variants = new Map<string, number>()
    const variantOf = (value: unknown): number => {
        const key = JSON.stringify(value)
        if (!variants.has(key)) variants.set(key, variants.size + 1)
        return variants.get(key)!
    }
    return [...fact.evidence.map(item => ({ item, variant: 0, group: groupOf(item) })), ...fact.conflicts.map(item => ({ item, variant: variantOf(item.value), group: groupOf(item) }))]
}

// ---- Every reading, in columns (public/data/readings.json), and each camera's quotes beside them.
const columns = { camera: [] as number[], spec: [] as number[], group: [] as number[], owner: [] as number[], standing: [] as number[], support: [] as number[] }
const groupTally = GROUPS.map(group => ({ ...group, readings: 0, differ: 0, checked: 0, matched: 0 }))
const specTally = specs.map(spec => ({ id: spec.id, readings: 0, differ: 0 }))
const standingTally = [0, 0, 0, 0, 0, 0]
const valueTally = { total: 0, verified: 0, likely: 0, single: 0, disputed: 0, contested: 0 }
const pairs = { both: GROUPS.map(() => GROUPS.map(() => 0)), agree: GROUPS.map(() => GROUPS.map(() => 0)) }
const grid = GROUPS.map(() => specs.map(() => [0, 0]))
const disagreementUrls: string[] = []
const disagreementUrlIndexes = new Map<string, number>()
const disagreements: unknown[] = []
/** How many readings from one source a disagreement keeps on each side: enough to show who says what. */
const KEPT_PER_GROUP = 2

cameras.forEach((camera, cameraPosition) => {
    const urls: string[] = []
    const urlIndexes = new Map<string, number>()
    const quotes: [string, number][] = []
    const values: Record<string, string> = {}
    specs.forEach((spec, specPosition) => {
        const fact = camera.facts[spec.id]
        if (!fact) return
        if (fact.text) values[spec.id] = clip(fact.text.replace(/\n/g, ', '), 90)
        const readings = sides(fact)
        const priced = fact.status === 'quote'
        if (!priced) {
            valueTally.total++
            valueTally[fact.status as 'verified' | 'likely' | 'single' | 'disputed']++
            if (fact.conflicts.length) valueTally.contested++
        }
        for (const reading of readings) {
            const standing = standingOf(fact, reading.variant > 0)
            columns.camera.push(cameraPosition)
            columns.spec.push(specPosition)
            columns.group.push(reading.group)
            columns.owner.push(ownerIndex(reading.item.owner))
            columns.standing.push(standing)
            columns.support.push(Math.min(255, fact.owners.length))
            if (!urlIndexes.has(reading.item.url)) {
                urlIndexes.set(reading.item.url, urls.length)
                urls.push(reading.item.url)
            }
            quotes.push([clip(reading.item.raw ?? '', 180), urlIndexes.get(reading.item.url)!])
            standingTally[standing]++
            groupTally[reading.group].readings++
            specTally[specPosition].readings++
            if (priced) continue
            const differs = reading.variant > 0
            grid[reading.group][specPosition][0]++
            if (differs) {
                grid[reading.group][specPosition][1]++
                groupTally[reading.group].differ++
                specTally[specPosition].differ++
            }
            // A source is checked against the values enough independent sources agree on.
            if (fact.status === 'verified') {
                groupTally[reading.group].checked++
                if (!differs) groupTally[reading.group].matched++
            }
        }
        if (priced) return
        for (const first of readings) {
            for (const second of readings) {
                if (first.group === second.group) continue
                pairs.both[first.group][second.group]++
                if (first.variant === second.variant) pairs.agree[first.group][second.group]++
            }
        }
        if (!fact.conflicts.length) return
        const kept = new Map<string, number>()
        const entries = readings
            .filter(reading => {
                const key = `${reading.group}:${reading.variant}`
                kept.set(key, (kept.get(key) ?? 0) + 1)
                return kept.get(key)! <= KEPT_PER_GROUP
            })
            .map(reading => {
                if (!disagreementUrlIndexes.has(reading.item.url)) {
                    disagreementUrlIndexes.set(reading.item.url, disagreementUrls.length)
                    disagreementUrls.push(reading.item.url)
                }
                return [reading.group, ownerIndex(reading.item.owner), reading.variant, disagreementUrlIndexes.get(reading.item.url)!, clip(reading.item.raw ?? '', 160)]
            })
        disagreements.push({ camera: cameraPosition, spec: specPosition, settled: fact.status !== 'disputed', value: values[spec.id] ?? '', entries })
    })
    write(['public', 'data', 'quotes', `${camera.slug}.json`], { values, urls, quotes })

    // What Compare shows for one camera: its level's reasons and every value with its standing.
    const facts = Object.fromEntries(
        Object.entries(camera.facts).map(([id, fact]) => [id, { text: fact.text === null ? null : clip(fact.text.replace(/\n/g, ', '), 140), status: fact.status, sources: fact.owners.length, conflicts: fact.conflicts.length }])
    )
    write(['public', 'data', 'cameras', `${camera.slug}.json`], { reasons: camera.level.reasons, facts })
})

write(['public', 'data', 'readings.json'], { cameras: cameras.map(camera => camera.slug), specs: specs.map(spec => spec.id), groups: GROUPS, owners, ...columns })
write(['public', 'data', 'disagreements.json'], { cameras: cameras.map(camera => camera.slug), specs: specs.map(spec => spec.id), urls: disagreementUrls, owners, items: disagreements })

// ---- Small tallies the views bundle.
write(['src', 'facts.json'], {
    readings: columns.camera.length,
    sites: owners.length,
    standing: standingTally,
    values: valueTally,
    groups: groupTally,
    specs: specTally,
    /** The spec level's areas, what each counts for, and the middle camera's score in it. */
    areas: (cameras.find(camera => camera.level.coverage === 100) ?? cameras[0]).level.reasons.map(reason => ({ area: reason.area, weight: reason.weight, median: median(cameras.flatMap(camera => camera.level.reasons.filter(other => other.area === reason.area).map(other => other.score))) })),
})
write(['src', 'agreement.json'], { groups: GROUPS.map(group => group.id), both: pairs.both, agree: pairs.agree, grid })

// ---- Bodies: agreed dimensions and weight, and each front picture cut down to the body itself.
const agreed = (fact: Fact | undefined): boolean => fact?.status === 'verified' || fact?.status === 'likely'
const SIZES = [
    { folder: 'thumbs', width: 168, quality: 72 },
    { folder: 'bodies', width: 420, quality: 78 },
]
for (const size of SIZES) mkdirSync(join(DATA, size.folder), { recursive: true })

/** The last build's bodies, so a picture that has not changed is not cut out again. */
const previous: Record<string, { aspect?: number }> = existsSync(join(ROOT, 'src', 'bodies.json')) ? read('src', 'bodies.json') : {}

/** Cuts a front picture down to the body and saves it at each size; returns the body's width over its height. */
async function cutOut(slug: string, source: string): Promise<number> {
    const files = SIZES.map(size => join(DATA, size.folder, `${slug}.webp`))
    const fresh = files.every(file => existsSync(file) && statSync(file).mtimeMs >= statSync(source).mtimeMs)
    const known = previous[slug]?.aspect
    if (fresh && known !== undefined) return known
    const trimmed = await sharp(source).trim().toBuffer({ resolveWithObject: true })
    for (const [index, size] of SIZES.entries()) await sharp(trimmed.data).resize({ width: size.width }).webp({ quality: size.quality }).toFile(files[index])
    return Math.round((trimmed.info.width / trimmed.info.height) * 1000) / 1000
}

const bodies: Record<string, unknown> = {}
let pictureBytes = 0
for (const camera of cameras) {
    const dimensions = agreed(camera.facts.dims) ? (camera.facts.dims.value as { w: number; h: number; d: number }) : undefined
    const weight = agreed(camera.facts.weight) ? (camera.facts.weight.value as number) : undefined
    const aspect = camera.image.front ? await cutOut(camera.slug, join(ROOT, 'public', camera.image.front)) : undefined
    if (aspect !== undefined) for (const size of SIZES) pictureBytes += statSync(join(DATA, size.folder, `${camera.slug}.webp`)).size
    bodies[camera.slug] = {
        ...(dimensions ? { width: dimensions.w, height: dimensions.h, depth: dimensions.d } : {}),
        ...(weight !== undefined ? { weight } : {}),
        ...(aspect !== undefined ? { aspect } : {}),
    }
}
write(['src', 'bodies.json'], bodies)

console.log(`cambench: wrote ${columns.camera.length} readings of ${cameras.length} cameras, ${disagreements.length} disagreements, ${Math.round(pictureBytes / 1024)} kB of small pictures`)
