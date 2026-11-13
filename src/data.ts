/**
 * The published results' summary, bundled at build time: results/cambench.json (every camera's headline
 * numbers, the spec dictionary and the sources). One camera's every spec is in results/cameras/<slug>.json
 * (its own page: src/details.ts); the overview's views load what scripts/build-data.ts makes of those
 * (src/readings.ts). The Outpost app publishes the results; the saved pages stay in Outpost.
 */
import results from '@results/cambench.json'

export const BENCH = {
    name: 'Cambench',
    tagline: "Every camera's specs, verified across independent sources.",
    repository: 'darkgrade/cambench',
    /** Where the site is served; also Vite's base. */
    path: '/cambench/',
    origin: 'https://darkgrade.com',
    /** What it is, in search terms: names like Toolbench are shared with academic benchmarks. */
    subject: 'Camera spec database, verified across sources',
}

/** The overview's views; each after the first is its own page at BENCH.path + id. */
export const TABS = [
    { id: 'story', label: 'Story' },
    // The Atlas keeps the address the spec level chart had.
    { id: 'spec-level', label: 'Atlas' },
    { id: 'size', label: 'Size' },
    { id: 'sources', label: 'Sources' },
    { id: 'compare', label: 'Compare' },
    { id: 'cameras', label: 'Cameras' },
    { id: 'method', label: 'Method' },
]

/** What each view is, for its page title and description. */
const TAB_PAGES: Record<string, { title: string; description: string }> = {
    'spec-level': { title: 'Camera atlas: spec level, price, resolution and more', description: 'Every camera placed by price, spec level, resolution, burst, weight, release date or sensor size. Pick the axes and find the one that fits.' },
    size: { title: 'Camera size comparison', description: 'Every camera body side by side at true relative size, from its verified dimensions, with the sensors drawn to scale.' },
    sources: { title: 'Which camera spec sources agree', description: 'How often the makers, B&H, DPReview, Wikipedia and the big retailers state the same camera specs, and exactly where they differ.' },
    compare: { title: 'Compare two cameras', description: 'Two cameras side by side: their spec levels area by area, and every spec with how well it is verified.' },
    cameras: { title: 'Every camera', description: 'Every camera with its spec level, price, sensor, resolution and burst, newest first, as a grid and a sortable table.' },
    method: { title: 'How we verify', description: 'Where the specs come from, how each page is read, what makes a value verified, and how the spec level is scored.' },
}

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

/** The camera a path names, if it is a camera's own page. */
export function cameraFromPath(path: string): CameraSummary | undefined {
    const slug = path.replace(BENCH.path, '').replace(/\/$/, '')
    return slug ? CAMERAS.find(candidate => candidate.slug === slug) : undefined
}

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
/** The year a camera was announced. */
export const year = (camera: CameraSummary): string => String(camera.specs.announced?.value ?? camera.specs.announced?.text ?? '').slice(0, 4)
/** Newest first, as the app's grid shows them. */
export const NEWEST = [...RUN.cameras].sort((first, second) => String(second.specs.announced?.value ?? '').localeCompare(String(first.specs.announced?.value ?? '')) || first.rank - second.rank)
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
    card: { heading: string; sub: string; image?: string }
}

export function routes(): Route[] {
    const overview: Route = {
        path: '',
        title: `${BENCH.name} by Darkgrade: ${BENCH.subject}`,
        description: BENCH.tagline,
        card: { heading: BENCH.name, sub: `${CAMERAS.length} cameras · specs verified across independent sources` },
    }
    const cameras = CAMERAS.map(
        (camera): Route => ({
            path: `${camera.slug}/`,
            title: `${camera.name} specs | ${BENCH.name} by Darkgrade`,
            description: `${camera.name}: spec level ${camera.level ?? '–'}/100 at ${price(camera.price)}, with every spec verified across independent sources.`,
            card: { heading: camera.name, sub: [camera.brand, camera.level == null ? null : `spec level ${camera.level}/100`, camera.price == null ? null : price(camera.price)].filter(Boolean).join(' · '), image: camera.image.front },
        })
    )
    // Each view gets its own card: spreading the overview gave every one of them the bench's name and
    // count, so /size and /specs shared a card that said nothing about either.
    const tabs = TABS.slice(1).map((tab): Route => ({
        ...overview,
        path: `${tab.id}/`,
        title: `${TAB_PAGES[tab.id].title} | ${BENCH.name} by Darkgrade`,
        description: TAB_PAGES[tab.id].description,
        card: { heading: TAB_PAGES[tab.id].title, sub: TAB_PAGES[tab.id].description },
    }))
    return [overview, ...tabs, ...cameras]
}
