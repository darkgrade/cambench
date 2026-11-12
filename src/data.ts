/**
 * The published results, bundled at build time: results/cambench.json (every camera's headline numbers,
 * for the list and the chart) and results/cameras/<slug>.json (one camera's every spec, for its page). The
 * Outpost app publishes both; the evidence behind them (saved pages, quotes) stays in Outpost.
 */
import results from '@results/cambench.json'

export const BENCH = {
    name: 'Cambench',
    tagline: "Every camera's specs, verified across independent sources.",
    repository: 'darkgrade/cambench',
    /** Where the site is served; also Vite's base. */
    path: '/cambench/',
    origin: 'https://darkgrade.com',
}

/** The overview's tabs; each after the first is its own page at BENCH.path + id. */
export const TABS = [
    { id: 'cameras', label: 'Cameras' },
    { id: 'value', label: 'Spec level vs. price' },
    { id: 'method', label: 'How we verify' },
]

export interface Reason {
    area: string
    weight: number
    score: number
    points: number
    why: string
}

export interface Level {
    level: number | null
    coverage: number
    reasons: Reason[]
    missing?: string[]
}

export interface Spec {
    id: string
    label: string
    group: string
    kind: string
    tip: string
}

/** A camera as the overview lists it. */
export interface CameraSummary {
    id: string
    slug: string
    name: string
    brand: string
    rank: number
    price: number | null
    /** 0–100: how much camera it is on fixed scales, whatever it costs. */
    level: number | null
    coverage: number | null
    image: { front?: string; back?: string }
    specs: Record<string, { value: unknown; text: string | null }>
}

/** What one source said about a spec: where it was read, when, and the line it was read from. */
export interface Evidence {
    source: string
    owner: string
    url: string
    at: string
    label: string
    raw: string
    value: unknown
}

export interface Fact {
    value: unknown
    text: string | null
    /** verified (enough independent sources agree), quote (a price, from listings), or how far from verified. */
    status: string
    /** Who states it, most reliable first; two sites of one company count once. */
    owners: string[]
    evidence: Evidence[]
    /** Sources that state something else. */
    conflicts: Evidence[]
    /** A list spec (ports, formats): each item with its own status. */
    items?: { text: string; status: string; owners: string[] }[]
}

export interface CameraDetail {
    id: string
    name: string
    brand: string
    price: number | null
    features: string[]
    level: Level
    image: { front?: string; back?: string }
    facts: Record<string, Fact>
    /** Every page read for this camera (its text stays in Outpost). */
    sources: { source: string; title: string; url: string; scrapedAt: string }[]
}

export interface Results {
    date?: string
    /** Independent sources that make a value verified. */
    need?: number
    specs: Spec[]
    sources: { key: string; title: string; owner: string; trusted: boolean }[]
    method: Record<string, string>
    cameras: CameraSummary[]
}

export const RUN = results as Results
export const CAMERAS = [...RUN.cameras].sort((first, second) => (second.level ?? -1) - (first.level ?? -1))

/**
 * One camera's page data: the server render reads every camera's file (src/details.ts); a browser reads only
 * its own page's, which the build embeds in that page (id "camera-data"), so no page carries every camera.
 */
export function embeddedDetail(): CameraDetail | undefined {
    const element = typeof document === 'undefined' ? null : document.getElementById('camera-data')
    return element?.textContent ? (JSON.parse(element.textContent) as CameraDetail) : undefined
}

export const picture = (path: string | undefined): string | undefined => (path ? `${BENCH.path}${path}` : undefined)
export const price = (value: number | null | undefined): string => (value === null || value === undefined ? '–' : `$${Math.round(value).toLocaleString('en-US')}`)
export const specText = (camera: CameraSummary, id: string): string => camera.specs[id]?.text ?? '–'
export const sensorFormat = (camera: CameraSummary): string => String((camera.specs.sensor?.value as { format?: string } | undefined)?.format ?? '')

/** One row of filters per category, each a one-of-a-few choice. */
export const FILTERS: { id: string; label: string; options: { id: string; label: string; matches: (camera: CameraSummary) => boolean }[] }[] = [
    {
        id: 'sensor',
        label: 'Sensor',
        options: [
            { id: 'all', label: 'Any sensor', matches: () => true },
            { id: 'full', label: 'Full frame', matches: camera => /full/i.test(sensorFormat(camera)) },
            { id: 'apsc', label: 'APS-C', matches: camera => /aps/i.test(sensorFormat(camera)) },
            { id: 'medium', label: 'Medium format', matches: camera => /medium/i.test(sensorFormat(camera)) },
            { id: 'small', label: 'Smaller', matches: camera => !!sensorFormat(camera) && !/full|aps|medium/i.test(sensorFormat(camera)) },
        ],
    },
    {
        id: 'price',
        label: 'Price',
        options: [
            { id: 'all', label: 'Any price', matches: () => true },
            { id: 'under1500', label: 'Under $1,500', matches: camera => (camera.price ?? Infinity) < 1500 },
            { id: 'under3000', label: '$1,500–3,000', matches: camera => (camera.price ?? 0) >= 1500 && (camera.price ?? 0) < 3000 },
            { id: 'over3000', label: '$3,000 and up', matches: camera => (camera.price ?? 0) >= 3000 },
        ],
    },
]

/** Every page the site has, with what its title, description and preview card say. */
export interface Route {
    path: string
    title: string
    description: string
    card: { eyebrow: string; heading: string; stats: { label: string; value: string }[] }
}

export function routes(): Route[] {
    const best = CAMERAS[0]
    const overview: Route = {
        path: '',
        title: `${BENCH.name} | Darkgrade`,
        description: BENCH.tagline,
        card: { eyebrow: 'Cambench by Darkgrade', heading: BENCH.tagline, stats: [{ label: 'Cameras', value: String(CAMERAS.length) }, ...(best ? [{ label: 'Highest spec level', value: best.name }] : [])] },
    }
    const cameras = CAMERAS.map(
        (camera): Route => ({
            path: `${camera.slug}/`,
            title: `${camera.name} specs | ${BENCH.name} by Darkgrade`,
            description: `${camera.name}: spec level ${camera.level ?? '–'}/100 at ${price(camera.price)}, with every spec verified across independent sources.`,
            card: {
                eyebrow: `Cambench · ${camera.brand}`,
                heading: camera.name,
                stats: [
                    { label: 'Spec level', value: `${camera.level ?? '–'}/100` },
                    { label: 'Price', value: price(camera.price) },
                    { label: 'Sensor', value: specText(camera, 'sensor').split(' (')[0] },
                ],
            },
        })
    )
    const tabs = TABS.slice(1).map((tab): Route => ({ ...overview, path: `${tab.id}/`, title: `${tab.label} | ${BENCH.name} by Darkgrade` }))
    return [overview, ...tabs, ...cameras]
}
