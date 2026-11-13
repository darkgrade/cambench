/**
 * The Atlas: every camera as its own small picture, placed on two axes you choose. Changing an axis
 * glides each camera to its new place; a maker can be picked out; a camera opens its own page.
 */
import { Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import type { ViewProps } from '@site/app'
import { BODIES, sensorOf } from '@site/bodies'
import { BENCH, CAMERAS, type CameraSummary, price, specText, year } from '@site/data'
import { Tip } from '@site/kit/story'
import { INK, TYPE } from '@site/kit/theme'
import { shortName, smallPicture } from '@site/readings'
import { scaleLinear, scaleLog, scaleTime } from 'd3-scale'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

const numberOf = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

/** A sensor's diagonal in millimetres, the usual single measure of its size. */
function sensorDiagonal(camera: CameraSummary): number | undefined {
    const sensor = sensorOf(camera)
    return sensor ? Math.hypot(sensor.width, sensor.height) : undefined
}

interface Axis {
    id: string
    label: string
    /** What a camera without a value lacks, for the note under the chart. */
    lacking: string
    kind: 'linear' | 'log' | 'time'
    value: (camera: CameraSummary) => number | undefined
    format: (value: number) => string
}

const AXES: Axis[] = [
    { id: 'price', label: 'Price', lacking: 'a price', kind: 'log', value: camera => camera.price ?? undefined, format: value => price(value) },
    { id: 'level', label: 'Spec level', lacking: 'a spec level', kind: 'linear', value: camera => camera.level ?? undefined, format: value => String(Math.round(value)) },
    { id: 'megapixels', label: 'Megapixels', lacking: 'an agreed resolution', kind: 'log', value: camera => numberOf(camera.specs.mp?.value), format: value => `${Math.round(value)} MP` },
    { id: 'burst', label: 'Burst', lacking: 'an agreed burst rate', kind: 'log', value: camera => numberOf(camera.specs.burst?.value), format: value => `${Math.round(value)} fps` },
    { id: 'weight', label: 'Weight', lacking: 'an agreed weight', kind: 'linear', value: camera => BODIES[camera.slug]?.weight, format: value => `${Math.round(value)} g` },
    {
        id: 'released',
        label: 'Released',
        lacking: 'a release date',
        kind: 'time',
        value: camera => {
            const time = Date.parse(String(camera.specs.announced?.value ?? ''))
            return Number.isNaN(time) ? undefined : time
        },
        format: value => String(new Date(value).getUTCFullYear()),
    },
    { id: 'sensor', label: 'Sensor size', lacking: 'agreed sensor dimensions', kind: 'linear', value: sensorDiagonal, format: value => `${Math.round(value)} mm` },
]

const BRANDS = [...new Set(CAMERAS.map(camera => camera.brand))].sort((first, second) => CAMERAS.filter(camera => camera.brand === second).length - CAMERAS.filter(camera => camera.brand === first).length)

interface Scale {
    place: (value: number) => number
    ticks: { at: number; text: string }[]
}

/** The ticks that sit at least `gap` pixels from the one before, so their words never touch. */
function spaced(ticks: Scale['ticks'], gap: number): Scale['ticks'] {
    const kept: Scale['ticks'] = []
    for (const tick of [...ticks].sort((first, second) => first.at - second.at)) if (!kept.length || tick.at - kept[kept.length - 1].at >= gap) kept.push(tick)
    return kept
}

/** An axis fitted to the cameras' values, from `start` to `end` pixels, with round ticks at least `gap` pixels apart. */
function fitAxis(axis: Axis, values: number[], start: number, end: number, gap: number): Scale {
    const low = Math.min(...values)
    const high = Math.max(...values)
    const count = Math.max(2, Math.floor(Math.abs(end - start) / gap))
    if (axis.kind === 'time') {
        const scale = scaleTime().domain([low, high]).nice().range([start, end])
        return { place: value => scale(value), ticks: spaced(scale.ticks(count).map(date => ({ at: scale(date), text: axis.format(date.getTime()) })), gap) }
    }
    if (axis.kind === 'log') {
        const scale = scaleLog()
            .domain([low * 0.9, high * 1.1])
            .range([start, end])
        const candidates = [1, 10, 100, 1000, 10000, 5, 50, 500, 5000, 2, 20, 200, 2000, 20000, 3, 30, 300, 3000].filter(tick => tick >= low * 0.9 && tick <= high * 1.1)
        // Powers of ten claim their place first, then fives, twos and threes where there is room.
        const kept: Scale['ticks'] = []
        for (const tick of candidates) if (kept.every(other => Math.abs(other.at - scale(tick)) >= gap)) kept.push({ at: scale(tick), text: axis.format(tick) })
        return { place: value => scale(value), ticks: kept }
    }
    const scale = scaleLinear().domain([low, high]).nice().range([start, end])
    return { place: value => scale(value), ticks: spaced(scale.ticks(count).map(tick => ({ at: scale(tick), text: axis.format(tick) })), gap) }
}

/** A row of choices that scrolls sideways when it is wider than the view. */
function Choice({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <span className={`${TYPE.label} w-12 shrink-0`}>{label}</span>
            <div className="min-w-0 overflow-x-auto [scrollbar-width:none]">
                <Tabs value={value} onValueChange={chosen => onChange(String(chosen))}>
                    <TabsList aria-label={label}>
                        {options.map(option => (
                            <TabsTrigger key={option.id} value={option.id}>
                                {option.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
        </div>
    )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <span className="flex justify-between gap-4 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className={TYPE.number}>{children}</span>
        </span>
    )
}

export default function AtlasView(_: ViewProps) {
    const frame = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({ width: 0, height: 0 })
    const [across, setAcross] = useState('price')
    const [up, setUp] = useState('level')
    const [brand, setBrand] = useState('all')
    const [pointed, setPointed] = useState<string | null>(null)
    const touched = useRef(false)

    useEffect(() => {
        const element = frame.current!
        const measure = (): void => setSize({ width: element.clientWidth, height: element.clientHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const wide = size.width >= 768
    const marker = Math.round(Math.min(62, Math.max(36, size.width / 23)))
    const horizontal = AXES.find(axis => axis.id === across)!
    const vertical = AXES.find(axis => axis.id === up)!

    const placed = useMemo(() => {
        if (!size.width) return undefined
        const known = CAMERAS.filter(camera => horizontal.value(camera) !== undefined && vertical.value(camera) !== undefined)
        const left = wide ? 64 : 46
        const scaleX = fitAxis(horizontal, known.map(camera => horizontal.value(camera)!), left + marker / 2, size.width - marker / 2 - 16, 64)
        const scaleY = fitAxis(vertical, known.map(camera => vertical.value(camera)!), size.height - 44 - marker / 2, marker / 2 + 8, 56)
        const places = new Map(known.map(camera => [camera.slug, { x: scaleX.place(horizontal.value(camera)!), y: scaleY.place(vertical.value(camera)!) }]))
        return { left, scaleX, scaleY, places, missing: CAMERAS.length - known.length }
    }, [size, wide, marker, horizontal, vertical])

    const hovered = pointed ? CAMERAS.find(camera => camera.slug === pointed) : undefined
    const hoveredPlace = hovered && placed?.places.get(hovered.slug)
    const lacking = horizontal.id === vertical.id ? horizontal.lacking : `${horizontal.lacking} or ${vertical.lacking}`

    return (
        <div className="flex h-full flex-col" style={{ background: INK.background }}>
            <div className="flex flex-col gap-1.5 px-4 pt-1 pb-2 sm:px-8">
                <div className="flex flex-col gap-x-8 gap-y-1.5 xl:flex-row">
                    <Choice label="Across" value={across} options={AXES} onChange={setAcross} />
                    <Choice label="Up" value={up} options={AXES} onChange={setUp} />
                </div>
                <Choice label="Maker" value={brand} options={[{ id: 'all', label: 'All' }, ...BRANDS.map(name => ({ id: name, label: name }))]} onChange={setBrand} />
            </div>
            <div ref={frame} className="relative min-h-0 flex-1 overflow-hidden" onPointerLeave={() => setPointed(null)}>
                {placed && (
                    <svg className="pointer-events-none absolute inset-0 size-full">
                        {placed.scaleX.ticks.map(tick => (
                            <g key={`x${tick.text}${tick.at}`}>
                                <line x1={tick.at} x2={tick.at} y1={8} y2={size.height - 36} stroke={INK.grid} />
                                <text x={tick.at} y={size.height - 20} textAnchor="middle" fontSize={11} fill={INK.muted}>
                                    {tick.text}
                                </text>
                            </g>
                        ))}
                        {placed.scaleY.ticks.map(tick => (
                            <g key={`y${tick.text}${tick.at}`}>
                                <line x1={placed.left - 8} x2={size.width} y1={tick.at} y2={tick.at} stroke={INK.grid} />
                                <text x={placed.left - 14} y={tick.at + 4} textAnchor="end" fontSize={11} fill={INK.muted}>
                                    {tick.text}
                                </text>
                            </g>
                        ))}
                        <text x={size.width - 16} y={size.height - 44} textAnchor="end" fontSize={11} fill={INK.text} fontWeight={500}>
                            {horizontal.label} →
                        </text>
                        <text x={placed.left - 8} y={14} fontSize={11} fill={INK.text} fontWeight={500}>
                            ↑ {vertical.label}
                        </text>
                    </svg>
                )}
                {placed &&
                    CAMERAS.map(camera => {
                        const place = placed.places.get(camera.slug)
                        const shown = place !== undefined && (brand === 'all' || camera.brand === brand)
                        const aspect = BODIES[camera.slug]?.aspect ?? 1.4
                        const lit = pointed === camera.slug
                        const picture = smallPicture(camera)
                        return (
                            <a
                                key={camera.slug}
                                href={`${BENCH.path}${camera.slug}/`}
                                aria-label={camera.name}
                                tabIndex={shown ? 0 : -1}
                                className="absolute top-0 left-0 block"
                                style={{
                                    width: marker,
                                    height: marker / aspect,
                                    transform: `translate(${(place?.x ?? size.width / 2) - marker / 2}px, ${(place?.y ?? size.height / 2) - marker / aspect / 2}px) scale(${lit ? 1.7 : 1})`,
                                    transition: 'transform 0.9s cubic-bezier(0.22, 0.8, 0.2, 1), opacity 0.5s',
                                    opacity: place === undefined ? 0 : shown ? 1 : 0.07,
                                    pointerEvents: shown ? 'auto' : 'none',
                                    zIndex: lit ? 5 : 1,
                                }}
                                onPointerDown={event => {
                                    touched.current = event.pointerType === 'touch'
                                }}
                                onPointerEnter={event => event.pointerType === 'mouse' && setPointed(camera.slug)}
                                onFocus={() => setPointed(camera.slug)}
                                onClick={event => {
                                    // A first tap shows what the camera is; a second opens it.
                                    if (!touched.current || pointed === camera.slug) return
                                    event.preventDefault()
                                    setPointed(camera.slug)
                                }}
                            >
                                {picture ? (
                                    <img src={picture} alt="" draggable={false} className="size-full object-contain drop-shadow-[0_2px_6px_rgb(0_0_0/0.6)]" />
                                ) : (
                                    <span className="flex size-full items-center justify-center rounded-md border border-white/25 bg-white/5 px-0.5 text-center text-[8px] leading-tight text-muted-foreground">
                                        {shortName(camera)}
                                    </span>
                                )}
                            </a>
                        )
                    })}
                {placed && placed.missing > 0 && (
                    <p className="pointer-events-none absolute bottom-1 left-4 text-[11px] text-muted-foreground sm:left-8">
                        Not placed: {placed.missing} without {lacking}.
                    </p>
                )}
                {hovered && hoveredPlace && (
                    <Tip x={hoveredPlace.x} y={hoveredPlace.y + (hoveredPlace.y < 220 ? marker * 0.62 : -marker * 0.62)} width={size.width}>
                        <p className="font-heading text-sm leading-snug font-semibold">{hovered.name}</p>
                        <p className="pb-1 text-xs text-muted-foreground">{[year(hovered), price(hovered.price)].filter(Boolean).join(' · ')}</p>
                        <Detail label="Spec level">{hovered.level ?? '–'}</Detail>
                        <Detail label="Sensor">{specText(hovered, 'sensor').split(' (')[0]}</Detail>
                        <Detail label="Resolution">{specText(hovered, 'mp')}</Detail>
                        <Detail label="Burst">{specText(hovered, 'burst')}</Detail>
                        <Detail label="Weight">{BODIES[hovered.slug]?.weight ? `${Math.round(BODIES[hovered.slug].weight!)} g` : '–'}</Detail>
                    </Tip>
                )}
            </div>
        </div>
    )
}
