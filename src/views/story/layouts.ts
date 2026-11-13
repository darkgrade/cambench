/**
 * The story's pictures. Every point is one reading (one thing one website says about one camera), and
 * each layout places all of them: cameras gathered by maker, readings by source and by spec, the
 * disagreements alone, how many sources back each value, and the cameras by release date and spec level.
 */
import { BENCH, type CameraSummary, RUN } from '@site/data'
import facts from '@site/facts.json'
import type { Label, Mark, Scene, Space } from '@site/kit/story'
import { type Readings, STANDING, STANDINGS, cameraOf, share, shortName } from '@site/readings'

export const PALETTE = STANDINGS.map(standing => standing.color)

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** The share of the plot's height a picture uses on a phone, leaving the rest to the caption card. */
const NARROW_SHARE = 0.82
/** Along a bar, what agrees comes first and what differs last, so differences collect at the tip. */
const TIP_ORDER = [0, 1, 2, 5, 4, 3]
/** How many independent sources back a value, as the columns of the "verified" picture. */
const SUPPORT_BINS = [
    { from: 1, to: 1, label: '1' },
    { from: 2, to: 2, label: '2' },
    { from: 3, to: 3, label: '3' },
    { from: 4, to: 4, label: '4' },
    { from: 5, to: 5, label: '5' },
    { from: 6, to: 6, label: '6' },
    { from: 7, to: 9, label: '7–9' },
    { from: 10, to: Infinity, label: '10+' },
]

/** A steady pseudo-random 0..1 for a point, so a layout is the same every time it is drawn. */
const scatter = (seed: number): number => {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return value - Math.floor(value)
}

interface Disc {
    x: number
    y: number
    radius: number
}

/** Places circles as near the middle as they fit without touching, in a frame `aspect` times wider than tall. */
function pack(radii: number[], aspect: number, gap: number): Disc[] {
    const placed: Disc[] = []
    const discs: Disc[] = radii.map(radius => ({ x: 0, y: 0, radius }))
    const order = radii.map((_, index) => index).sort((first, second) => radii[second] - radii[first])
    const stride = Math.min(...radii) * 0.45
    for (const index of order) {
        const disc = discs[index]
        for (let step = 0; step < 6000; step++) {
            const distance = Math.sqrt(step) * stride
            disc.x = Math.cos(step * GOLDEN_ANGLE) * distance * aspect
            disc.y = Math.sin(step * GOLDEN_ANGLE) * distance
            if (placed.every(other => Math.hypot(other.x - disc.x, other.y - disc.y) >= other.radius + disc.radius + gap)) break
        }
        placed.push(disc)
    }
    return discs
}

/** Scales packed circles to fill a box of the plot (in pixels), centred. */
function fit(discs: Disc[], box: { x: number; y: number; width: number; height: number }): Disc[] {
    const left = Math.min(...discs.map(disc => disc.x - disc.radius))
    const right = Math.max(...discs.map(disc => disc.x + disc.radius))
    const top = Math.min(...discs.map(disc => disc.y - disc.radius))
    const bottom = Math.max(...discs.map(disc => disc.y + disc.radius))
    const scale = Math.min(box.width / (right - left), box.height / (bottom - top))
    const offsetX = box.x + (box.width - (right - left) * scale) / 2 - left * scale
    const offsetY = box.y + (box.height - (bottom - top) * scale) / 2 - top * scale
    return discs.map(disc => ({ x: disc.x * scale + offsetX, y: disc.y * scale + offsetY, radius: disc.radius * scale }))
}

/** One bar of a bar chart drawn in points. */
interface Bar {
    label: string
    /** Reading indexes, in the order they fill the bar. */
    members: number[]
    /** Words after the bar's tip. */
    note?: string
    /** Starts a new block, with a gap before it and this name at the right. */
    block?: string
}

export interface Layouts {
    count: number
    constellations: (space: Space) => Scene
    bySource: (space: Space) => Scene
    bySpec: (space: Space) => Scene
    contested: (space: Space) => Scene
    support: (space: Space) => Scene
    timeline: (space: Space) => Scene
}

export function makeLayouts(readings: Readings): Layouts {
    const count = readings.camera.length
    const color = Uint8Array.from(readings.standing)
    const cameras: CameraSummary[] = readings.cameras.map(cameraOf)
    const arrays = () => ({ x: new Float32Array(count), y: new Float32Array(count) })
    const differs = (index: number): boolean => readings.standing[index] === STANDING.differs || readings.standing[index] === STANDING.unsettled
    const byTip = (first: number, second: number): number => TIP_ORDER.indexOf(readings.standing[first]) - TIP_ORDER.indexOf(readings.standing[second]) || first - second

    /** Reading indexes gathered by one of the columns (camera, spec, source). */
    function gather(column: number[], size: number): number[][] {
        const groups: number[][] = Array.from({ length: size }, () => [])
        for (let index = 0; index < count; index++) groups[column[index]].push(index)
        return groups
    }
    const ofCamera = gather(readings.camera, cameras.length)
    const ofSpec = gather(readings.spec, readings.specs.length)
    const ofGroup = gather(readings.group, readings.groups.length)
    const typical = count / cameras.length

    /** Fills a disc with points, spiralling out from its middle. */
    function fill(members: number[], disc: Disc, space: Space, x: Float32Array, y: Float32Array): void {
        members.forEach((index, position) => {
            const reach = Math.sqrt((position + 0.5) / members.length) * disc.radius
            x[index] = (disc.x + Math.cos(position * GOLDEN_ANGLE) * reach) / space.width
            y[index] = (disc.y + Math.sin(position * GOLDEN_ANGLE) * reach) / space.height
        })
    }

    /** A camera's disc holds its readings at one density everywhere, so its size is how much is said about it. */
    const cameraRadius = (camera: number): number => Math.sqrt(ofCamera[camera].length)
    /** What differs is drawn larger, so it shows among thousands that agree. */
    const emphasis = Float32Array.from(readings.standing, standing => (standing === STANDING.differs || standing === STANDING.unsettled ? 1.7 : 1))

    function constellations(space: Space): Scene {
        const { x, y } = arrays()
        const brands = [...new Set(cameras.map(camera => camera.brand))]
            .map(brand => {
                const members = cameras.flatMap((camera, index) => (camera.brand === brand ? [index] : []))
                const discs = pack(members.map(cameraRadius), 1, 2.5)
                const middleX = (Math.min(...discs.map(disc => disc.x - disc.radius)) + Math.max(...discs.map(disc => disc.x + disc.radius))) / 2
                const middleY = (Math.min(...discs.map(disc => disc.y - disc.radius)) + Math.max(...discs.map(disc => disc.y + disc.radius))) / 2
                const centred = discs.map(disc => ({ x: disc.x - middleX, y: disc.y - middleY, radius: disc.radius }))
                return { brand, members, discs: centred, radius: Math.max(...centred.map(disc => Math.hypot(disc.x, disc.y) + disc.radius)) }
            })
            .sort((first, second) => second.radius - first.radius)
        const labelRoom = 18
        const placed = fit(pack(brands.map(brand => brand.radius), space.width / space.height, 9), { x: 0, y: 0, width: space.width, height: space.height - labelRoom })
        const scale = placed[0].radius / brands[0].radius
        brands.forEach((brand, position) => {
            brand.members.forEach((camera, order) => {
                const disc = brand.discs[order]
                fill(ofCamera[camera], { x: placed[position].x + disc.x * scale, y: placed[position].y + disc.y * scale, radius: disc.radius * scale * 0.94 }, space, x, y)
            })
        })
        const named = space.wide ? brands.length : 5
        const labels: Label[] = brands.slice(0, named).map((brand, position) => ({ u: placed[position].x / space.width, v: (placed[position].y + placed[position].radius + 9) / space.height, text: brand.brand, tone: 'strong' }))
        return { x, y, color, scale: emphasis, radius: Math.max(1, scale * 0.7), labels }
    }

    /** A bar chart made of the points themselves: one row per bar, each point a cell. */
    function bars(space: Space, rows: Bar[], gutter: number, reserve: number): Scene {
        const { x, y } = arrays()
        const bright = new Float32Array(count)
        const labelAbove = gutter === 0
        const blockGap = 0.8
        const units = rows.length + rows.filter((row, index) => row.block && index > 0).length * blockGap
        const top = space.height * 0.02
        const pitch = (space.height - top) / units
        const thickness = labelAbove ? Math.max(4, pitch - 15) : pitch * 0.74
        const length = space.width - gutter - reserve
        const longest = Math.max(...rows.map(row => row.members.length))
        const { lines, cell } = cells(thickness, length, longest)
        const labels: Label[] = []
        let unitsAbove = 0
        rows.forEach((row, position) => {
            if (row.block && position > 0) unitsAbove += blockGap
            const rowTop = top + unitsAbove * pitch
            const barTop = labelAbove ? rowTop + 13 : rowTop + (pitch - lines * cell) / 2
            row.members.forEach((index, order) => {
                x[index] = (gutter + (Math.floor(order / lines) + 0.5) * cell) / space.width
                y[index] = (barTop + ((order % lines) + 0.5) * cell) / space.height
                bright[index] = 1
            })
            const tip = gutter + Math.ceil(row.members.length / lines) * cell
            const centre = (barTop + (lines * cell) / 2) / space.height
            if (row.label) labels.push(labelAbove ? { u: 0, v: (rowTop + 5) / space.height, text: row.label, align: 'start', tone: 'strong' } : { u: (gutter - 8) / space.width, v: centre, text: row.label, align: 'end' })
            if (row.note) labels.push(labelAbove ? { u: 1, v: (rowTop + 5) / space.height, text: row.note, align: 'end' } : { u: (tip + 8) / space.width, v: centre, text: row.note, align: 'start' })
            if (row.block) labels.push({ u: 1, v: (rowTop + (rows.filter(other => blockOf(rows, other) === row.block).length * pitch) / 2) / space.height, text: row.block, align: 'end', tone: 'strong' })
            unitsAbove += 1
        })
        return { x, y, color, bright, radius: Math.max(0.7, (cell / 2) * 0.9), shape: 'cell', labels }
    }

    function bySource(space: Space): Scene {
        const rows = readings.groups
            .map((group, index): Bar => {
                const tally = facts.groups.find(item => item.id === group.id)
                return { label: group.label, members: [...ofGroup[index]].sort(byTip), note: tally && tally.checked > 300 ? `${share(tally.matched, tally.checked)} match` : undefined }
            })
            .sort((first, second) => second.members.length - first.members.length)
        return bars(space, rows, space.wide ? 96 : 0, space.wide ? 84 : 0)
    }

    function bySpec(space: Space): Scene {
        const dense = !space.wide || space.height < 480
        const contested = facts.specs
            .filter(spec => spec.readings > 100)
            .map(spec => ({ index: readings.specs.indexOf(spec.id), rate: spec.differ / spec.readings }))
            .sort((first, second) => second.rate - first.rate)
            .slice(0, 3)
        let block = ''
        const rows = RUN.specs.flatMap((spec, index): Bar[] => {
            if (!ofSpec[index].length) return []
            const starts = spec.group !== block
            block = spec.group
            const marked = contested.find(item => item.index === index)
            return [{ label: dense ? '' : spec.label, members: [...ofSpec[index]].sort(byTip), block: starts ? spec.group : undefined, note: marked && !dense ? `${share(marked.rate, 1)} differ` : undefined }]
        })
        return bars(space, rows, dense ? 2 : 168, dense ? 78 : 92)
    }

    function contested(space: Space): Scene {
        const { x, y } = arrays()
        const bright = new Float32Array(count)
        const scale = new Float32Array(count)
        // What agrees becomes faint dust behind the rest, thinning toward the edges.
        for (let index = 0; index < count; index++) {
            const angle = scatter(index * 1.7 + 3) * Math.PI * 2
            const reach = Math.pow(scatter(index * 2.3 + 11), 0.62) * 0.56
            x[index] = 0.5 + Math.cos(angle) * reach
            y[index] = 0.5 + Math.sin(angle) * reach
            bright[index] = 0
            scale[index] = 0.45
        }
        const groups = RUN.specs.map((spec, index) => ({ spec, members: ofSpec[index].filter(differs).sort(byTip) })).filter(group => group.members.length > 0)
        const labelRoom = 16
        const discs = fit(pack(groups.map(group => Math.sqrt(group.members.length)), space.width / space.height, 1.1), { x: 0, y: 0, width: space.width, height: space.height - labelRoom })
        groups.forEach((group, position) => {
            fill(group.members, { ...discs[position], radius: discs[position].radius * 0.92 }, space, x, y)
            for (const index of group.members) {
                bright[index] = 1
                scale[index] = 1
            }
        })
        const unit = discs[0].radius / Math.sqrt(groups[0].members.length)
        const named = [...groups.keys()].sort((first, second) => groups[second].members.length - groups[first].members.length).slice(0, space.wide ? 14 : 3)
        const labels: Label[] = named.map(position => ({ u: discs[position].x / space.width, v: (discs[position].y + discs[position].radius + 8) / space.height, text: groups[position].spec.label.replace(/ \((CIPA|native|built-in)\)$/, ''), tone: 'strong' }))
        return { x, y, color, bright, scale, radius: Math.max(1.4, unit * 0.62), labels }
    }

    function support(space: Space): Scene {
        const { x, y } = arrays()
        const stacks = SUPPORT_BINS.map(bin => ({ ...bin, members: [] as number[] }))
        const prices: number[] = []
        for (let index = 0; index < count; index++) {
            if (readings.standing[index] === STANDING.price) prices.push(index)
            else stacks.find(stack => readings.support[index] >= stack.from && readings.support[index] <= stack.to)?.members.push(index)
        }
        const columns = [...stacks.map(stack => ({ label: stack.label, members: stack.members.sort(byTip) })), { label: 'Prices', members: prices }]
        const left = space.wide ? 0.02 : 0
        const gap = 0.7
        const pitch = (space.width * (1 - left)) / (columns.length + gap)
        const thickness = pitch * 0.8
        const base = space.height * 0.91
        const rise = space.height * 0.8
        const tallest = Math.max(...columns.map(column => column.members.length))
        const { lines, cell } = cells(thickness, rise, tallest)
        const centre = (position: number): number => space.width * left + (position + 0.5 + (position === columns.length - 1 ? gap : 0)) * pitch
        columns.forEach((column, position) => {
            const start = centre(position) - (lines * cell) / 2
            column.members.forEach((index, order) => {
                x[index] = (start + ((order % lines) + 0.5) * cell) / space.width
                y[index] = (base - (Math.floor(order / lines) + 0.5) * cell) / space.height
            })
        })
        const need = RUN.need ?? 3
        const threshold = (centre(need - 2) + centre(need - 1)) / 2 / space.width
        const labels: Label[] = [
            ...columns.map((column, position): Label => ({ u: centre(position) / space.width, v: 0.945, text: column.label, tone: position === columns.length - 1 ? 'muted' : 'strong' })),
            { u: left, v: 0.99, text: space.wide ? 'Independent sources that state the same value →' : 'Sources that agree →', align: 'start' },
            { u: threshold + 0.012, v: 0.03, text: 'Verified from here', align: 'start', tone: 'accent' },
        ]
        const marks: Mark[] = [{ u0: threshold, v0: 0.01, u1: threshold, v1: 0.92, tone: 'accent' }]
        return { x, y, color, radius: Math.max(0.7, (cell / 2) * 0.9), shape: 'cell', labels, marks }
    }

    function timeline(space: Space): Scene {
        const { x, y } = arrays()
        const dated = cameras.map(camera => Date.parse(String(camera.specs.announced?.value ?? '')))
        const known = dated.filter(time => !Number.isNaN(time))
        const first = new Date(Math.min(...known)).getUTCFullYear()
        const last = new Date(Math.max(...known)).getUTCFullYear() + 1
        const levels = cameras.flatMap(camera => (camera.level === null ? [] : [camera.level]))
        const floor = Math.floor(Math.min(...levels) / 10) * 10
        const ceiling = Math.ceil(Math.max(...levels) / 10) * 10
        const left = space.wide ? 0.06 : 0.09
        const undatedColumn = 0.955
        const right = 0.86
        const across = (time: number): number => left + ((time - Date.UTC(first, 0, 1)) / (Date.UTC(last, 0, 1) - Date.UTC(first, 0, 1))) * (right - left)
        const up = (level: number | null): number => (level === null ? 0.9 : 0.86 - ((level - floor) / (ceiling - floor)) * 0.8)
        const blob = Math.min(space.width, space.height) * 0.02
        const centres = cameras.map((camera, index) => ({
            u: Number.isNaN(dated[index]) ? undatedColumn + (scatter(index) - 0.5) * 0.05 : across(dated[index]),
            v: up(camera.level),
        }))
        

        // Name the cameras at the edges of the picture, each on the first side where it covers no camera or name.
        const radii = cameras.map((_, index) => blob * Math.min(1.5, Math.max(0.7, cameraRadius(index) / Math.sqrt(typical))))
        const byDate = cameras.map((_, index) => index).filter(index => !Number.isNaN(dated[index]))
        const newest = [...byDate].sort((one, other) => dated[other] - dated[one])
        const candidates = [...new Set([0, newest[0], newest[newest.length - 1], byDate[byDate.length - 1], 1, 2, newest[1], 3, 4, 5, 6, 7])].filter(index => !Number.isNaN(dated[index]))
        const taken = cameras.map((_, index) => ({ left: centres[index].u * space.width - radii[index], right: centres[index].u * space.width + radii[index], top: centres[index].v * space.height - radii[index], bottom: centres[index].v * space.height + radii[index] }))
        cameras.forEach((_, index) => fill(ofCamera[index], { x: centres[index].u * space.width, y: centres[index].v * space.height, radius: radii[index] }, space, x, y))
        const names: Label[] = []
        for (const index of candidates) {
            if (names.length >= (space.wide ? 8 : 4)) break
            const text = shortName(cameras[index])
            const width = text.length * 6.2 + 6
            const centreX = centres[index].u * space.width
            const centreY = centres[index].v * space.height
            const reach = radii[index] + 5
            const sides: { x: number; y: number; align: Label['align'] }[] = [
                { x: centreX, y: centreY - reach - 7, align: 'center' },
                { x: centreX + reach, y: centreY, align: 'start' },
                { x: centreX - reach, y: centreY, align: 'end' },
                { x: centreX, y: centreY + reach + 7, align: 'center' },
            ]
            for (const side of sides) {
                const left = side.align === 'center' ? side.x - width / 2 : side.align === 'start' ? side.x : side.x - width
                const box = { left, right: left + width, top: side.y - 7, bottom: side.y + 7 }
                if (box.left < 0 || box.right > space.width * right || box.top < 0) continue
                if (taken.some((other, position) => position !== index && box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue
                taken.push(box)
                names.push({ u: side.x / space.width, v: side.y / space.height, text, align: side.align, tone: 'strong', href: `${BENCH.path}${cameras[index].slug}/` })
                break
            }
        }
        const every = space.wide ? 2 : 4
        const years = Array.from({ length: last - first + 1 }, (_, offset) => first + offset).filter(year => (year - first) % every === 0)
        const ticks = Array.from({ length: Math.floor((ceiling - floor) / 20) + 1 }, (_, step) => floor + step * 20)
        const labels: Label[] = [
            ...names,
            ...years.map((year): Label => ({ u: across(Date.UTC(year, 0, 1)), v: 0.955, text: String(year) })),
            { u: undatedColumn, v: 0.955, text: space.wide ? 'No date found' : 'No date' },
            ...ticks.map((level): Label => ({ u: left - 0.015, v: up(level), text: String(level), align: 'end' })),
            { u: left - 0.015, v: 0.005, text: 'Spec level', align: space.wide ? 'end' : 'start' },
        ]
        const marks: Mark[] = [
            ...ticks.map((level): Mark => ({ u0: left, v0: up(level), u1: 1, v1: up(level), tone: 'line' })),
            { u0: (right + undatedColumn - 0.035) / 2, v0: 0.03, u1: (right + undatedColumn - 0.035) / 2, v1: 0.93, tone: 'line' },
        ]
        return { x, y, color, scale: emphasis, radius: Math.max(1.2, blob / 7), labels, marks }
    }

    /**
     * On a phone the caption card rides up over the bottom of the picture, so each picture is drawn in
     * the upper part of the plot there.
     */
    const clear = (draw: (space: Space) => Scene) => (space: Space): Scene => {
        if (space.wide) return draw(space)
        const scene = draw({ ...space, height: space.height * NARROW_SHARE })
        return {
            ...scene,
            y: scene.y.map(value => value * NARROW_SHARE),
            labels: scene.labels?.map(label => ({ ...label, v: label.v * NARROW_SHARE })),
            marks: scene.marks?.map(mark => ({ ...mark, v0: mark.v0 * NARROW_SHARE, v1: mark.v1 * NARROW_SHARE })),
        }
    }

    return { count, constellations: clear(constellations), bySource: clear(bySource), bySpec: clear(bySpec), contested: clear(contested), support: clear(support), timeline: clear(timeline) }
}

/** The largest square cell that fits `most` cells into a bar `thickness` by `length`, and how many lines of them. */
function cells(thickness: number, length: number, most: number): { lines: number; cell: number } {
    let best = { lines: 1, cell: 0 }
    for (let lines = 1; lines <= Math.max(1, Math.floor(thickness)); lines++) {
        const cell = Math.min(thickness / lines, length / Math.ceil(most / lines))
        if (cell > best.cell) best = { lines, cell }
    }
    return best
}

/** The block a bar belongs to: the nearest block name at or before it. */
function blockOf(rows: Bar[], row: Bar): string | undefined {
    let block: string | undefined
    for (const candidate of rows) {
        if (candidate.block) block = candidate.block
        if (candidate === row) return block
    }
    return block
}
