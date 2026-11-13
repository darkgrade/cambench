/**
 * Size: every body drawn at one scale from its agreed dimensions, standing on one line, and the
 * sensors of the cameras you pick drawn at one scale too.
 */
import { Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import type { ViewProps } from '@site/app'
import { BODIES, millimetres, sensorOf } from '@site/bodies'
import { BENCH, CAMERAS, type CameraSummary } from '@site/data'
import { INK, TYPE, hues } from '@site/kit/theme'
import { shortName, smallPicture } from '@site/readings'
import { useEffect, useMemo, useRef, useState } from 'react'

const SORTS = [
    { id: 'width', label: 'Width' },
    { id: 'weight', label: 'Weight' },
    { id: 'released', label: 'Released' },
]
/** How many cameras' sensors are drawn over each other at once. */
const MOST_SENSORS = 5
const SENSOR_COLORS = hues(MOST_SENSORS, 0.8, 0.13, 85)

const SIZED = CAMERAS.filter(camera => BODIES[camera.slug]?.width !== undefined)
const UNSIZED = CAMERAS.filter(camera => BODIES[camera.slug]?.width === undefined)
const released = (camera: CameraSummary): number => Date.parse(String(camera.specs.announced?.value ?? '')) || Infinity

/** The highest spec level camera of each sensor format, to start with. */
const STARTING = [...new Set(CAMERAS.map(camera => sensorOf(camera)?.format).filter(Boolean))].flatMap(format => {
    const first = CAMERAS.find(camera => sensorOf(camera)?.format === format)
    return first ? [first.slug] : []
})

function ordered(sort: string): CameraSummary[] {
    const value = (camera: CameraSummary): number => (sort === 'weight' ? (BODIES[camera.slug].weight ?? Infinity) : sort === 'released' ? released(camera) : BODIES[camera.slug].width!)
    return [...SIZED].sort((first, second) => value(first) - value(second) || BODIES[first.slug].width! - BODIES[second.slug].width!)
}

/** One camera standing on the line: its picture as wide as the body really is, at `scale` pixels per millimetre. */
function Standing({ camera, scale, color, onPick }: { camera: CameraSummary; scale: number; color: string | undefined; onPick: () => void }) {
    const body = BODIES[camera.slug]
    const width = body.width! * scale
    const picture = smallPicture(camera, true)
    const height = picture && body.aspect ? width / body.aspect : body.height! * scale
    return (
        <li className="flex shrink-0 flex-col items-center" style={{ width: Math.max(width, 96) }}>
            <button type="button" onClick={onPick} aria-pressed={color !== undefined} aria-label={`${camera.name}: show its sensor`} className="group flex flex-1 cursor-pointer flex-col justify-end">
                {picture ? (
                    <img src={picture} alt="" loading="lazy" draggable={false} width={width} height={height} className="block transition-transform group-hover:-translate-y-1" style={{ width, height }} />
                ) : (
                    <span className="flex items-center justify-center rounded-lg border border-dashed border-white/25 text-[11px] text-muted-foreground" style={{ width, height }}>
                        No picture yet
                    </span>
                )}
            </button>
            <span className="mt-0 h-px w-full bg-white/30" />
            <span className="mt-2 flex h-2 items-center self-center border-x border-white/40" style={{ width }}>
                <span className="h-px w-full bg-white/40" />
            </span>
            <span className={`${TYPE.number} mt-1 text-[11px] text-muted-foreground`}>{millimetres(body.width!)} mm</span>
            <a href={`${BENCH.path}${camera.slug}/`} className="mt-2 max-w-full truncate text-xs font-medium hover:underline" style={{ color }}>
                {shortName(camera)}
            </a>
            <span className="text-[11px] text-muted-foreground">{camera.brand}</span>
            <span className={`${TYPE.number} text-[11px] text-muted-foreground`}>
                {millimetres(body.height!)} tall · {millimetres(body.depth!)} deep{body.weight ? ` · ${Math.round(body.weight)} g` : ''}
            </span>
        </li>
    )
}

/** The picked cameras' sensors over each other at one scale, largest behind. */
function Sensors({ picked, scale, onDrop }: { picked: CameraSummary[]; scale: number; onDrop: (slug: string) => void }) {
    const sensors = picked.flatMap((camera, index) => {
        const sensor = sensorOf(camera)
        return sensor ? [{ camera, sensor, color: SENSOR_COLORS[index] }] : []
    })
    const widest = Math.max(36, ...sensors.map(item => item.sensor.width))
    const tallest = Math.max(24, ...sensors.map(item => item.sensor.height))
    const byArea = [...sensors].sort((first, second) => second.sensor.width * second.sensor.height - first.sensor.width * first.sensor.height)
    return (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
            <svg width={widest * scale + 2} height={tallest * scale + 2} className="shrink-0" role="img" aria-label="The picked cameras' sensors at one scale">
                {byArea.map(item => {
                    const width = item.sensor.width * scale
                    const height = item.sensor.height * scale
                    return <rect key={item.camera.slug} x={(widest * scale - width) / 2 + 1} y={(tallest * scale - height) / 2 + 1} width={width} height={height} rx={3} fill={item.color} fillOpacity={0.1} stroke={item.color} strokeWidth={1.5} />
                })}
            </svg>
            <ul className="flex min-w-0 flex-col gap-2">
                {picked.map((camera, index) => {
                    const sensor = sensorOf(camera)
                    return (
                        <li key={camera.slug} className="flex items-center gap-3 text-sm">
                            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: SENSOR_COLORS[index] }} />
                            <span className="min-w-0">
                                <a href={`${BENCH.path}${camera.slug}/`} className="font-medium hover:underline">
                                    {camera.name}
                                </a>
                                <span className={`${TYPE.number} block text-xs text-muted-foreground`}>
                                    {sensor ? `${sensor.format} · ${millimetres(sensor.width)} × ${millimetres(sensor.height)} mm` : 'Its sources do not agree on the sensor\'s dimensions'}
                                </span>
                            </span>
                            <button type="button" onClick={() => onDrop(camera.slug)} aria-label={`Remove ${camera.name}`} className="ml-auto cursor-pointer px-2 text-muted-foreground hover:text-foreground">
                                ×
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

export default function SizeView(_: ViewProps) {
    const frame = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(1200)
    const [sort, setSort] = useState('width')
    const [picked, setPicked] = useState(STARTING.slice(0, MOST_SENSORS))

    useEffect(() => {
        const element = frame.current!
        const measure = (): void => setWidth(element.clientWidth)
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const wide = width >= 768
    // Pixels per millimetre: small enough to see several bodies at once, large enough to see each.
    const scale = Math.min(1.6, Math.max(1, width / 900))
    const cameras = useMemo(() => ordered(sort), [sort])
    const tallest = Math.max(...SIZED.map(camera => BODIES[camera.slug].height!))
    const toggle = (slug: string): void => setPicked(previous => (previous.includes(slug) ? previous.filter(other => other !== slug) : [...previous, slug].slice(-MOST_SENSORS)))

    return (
        <div ref={frame} className="h-full overflow-y-auto" style={{ background: INK.background }}>
            <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-wrap items-end justify-between gap-3 px-4 sm:px-8">
                    <div>
                        <h2 className={TYPE.title}>Every body, at one scale</h2>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Each camera is drawn as wide as its sources agree it is, standing on one line. Scroll sideways; pick a camera to see its sensor below.</p>
                    </div>
                    <Tabs value={sort} onValueChange={value => setSort(String(value))}>
                        <TabsList aria-label="Order">
                            {SORTS.map(option => (
                                <TabsTrigger key={option.id} value={option.id}>
                                    {option.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
                <div className="relative">
                    <ol className="flex items-stretch gap-5 overflow-x-auto px-4 pt-3 pb-4 sm:gap-8 sm:px-8" style={{ minHeight: tallest * scale + 110 }}>
                        {cameras.map(camera => (
                            <Standing key={camera.slug} camera={camera} scale={scale} color={picked.includes(camera.slug) ? SENSOR_COLORS[picked.indexOf(camera.slug)] : undefined} onPick={() => toggle(camera.slug)} />
                        ))}
                    </ol>
                    <div className="pointer-events-none absolute top-1 left-4 flex flex-col gap-1 sm:left-8">
                        <span className="h-1.5 border-x border-b border-white/60" style={{ width: 50 * scale }} />
                        <span className={`${TYPE.number} text-[11px] text-muted-foreground`}>5 cm</span>
                    </div>
                </div>
                <div className="flex flex-col gap-4 px-4 sm:px-8">
                    <div>
                        <h2 className={TYPE.heading}>Their sensors, at one scale</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Pick cameras in the line-up to add or remove them, up to five at once.</p>
                    </div>
                    {picked.length ? <Sensors picked={picked.map(slug => CAMERAS.find(camera => camera.slug === slug)!)} scale={wide ? 5 : 4} onDrop={toggle} /> : <p className="text-sm text-muted-foreground">Pick a camera above to see its sensor.</p>}
                    {UNSIZED.length > 0 && (
                        <p className="max-w-3xl pt-4 text-xs text-muted-foreground">
                            Not in the line-up, because their sources do not yet agree on their dimensions: {UNSIZED.map(camera => camera.name).join(', ')}.
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
