import { BENCH, CAMERAS, type CameraSummary, picture, price, year } from '@site/data'
import { useState } from 'react'

const W = 760
const H = 420
const LEFT = 40
const RIGHT = 20
const TOP = 16
const BOTTOM = 46

// A round step for the price axis: 1, 2 or 5 times a power of ten.
function niceStep(range: number): number {
    const power = 10 ** Math.floor(Math.log10(range))
    const scaled = range / power
    return (scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10) * power
}

/**
 * Spec level against price, every camera a dot: the camera a page is about (focus) stands out, and hovering a dot
 * shows which camera it is; clicking opens it. Price is today's new price where known, else the launch MSRP.
 */
export function LevelChart({ cameras = CAMERAS, focus }: { cameras?: CameraSummary[]; focus?: string }) {
    const [hover, setHover] = useState<string | null>(null)
    const points = cameras.filter(camera => camera.price !== null && camera.level !== null).map(camera => ({ camera, x: camera.price!, y: camera.level! }))
    if (points.length < 2) return <p className="text-sm text-muted-foreground">The chart needs a price and a spec level for at least two cameras.</p>
    const xs = points.map(point => point.x)
    const pad = (Math.max(...xs) - Math.min(...xs)) * 0.08 || 200
    const x0 = Math.max(0, Math.min(...xs) - pad)
    const x1 = Math.max(...xs) + pad
    const sx = (x: number) => LEFT + ((x - x0) / (x1 - x0)) * (W - LEFT - RIGHT)
    const sy = (y: number) => TOP + (1 - y / 100) * (H - TOP - BOTTOM)
    const step = niceStep((x1 - x0) / 5)
    const ticks: number[] = []
    for (let tick = Math.ceil(x0 / step) * step; tick <= x1; tick += step) ticks.push(tick)
    const hovered = points.find(point => point.camera.id === hover)
    const ordered = [...points].sort(point => (point.camera.id === focus ? 1 : -1))
    const at = hovered && { x: (sx(hovered.x) / W) * 100, y: (sy(hovered.y) / H) * 100 }

    return (
        <div className="flex flex-col gap-3">
            <div className="relative">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Spec level against price">
                    <line x1={LEFT} x2={LEFT} y1={TOP} y2={H - BOTTOM} className="stroke-muted-foreground" strokeWidth={1.5} />
                    <line x1={LEFT} x2={W - RIGHT} y1={H - BOTTOM} y2={H - BOTTOM} className="stroke-muted-foreground" strokeWidth={1.5} />
                    {ticks.map(tick => (
                        <g key={tick}>
                            <line x1={sx(tick)} x2={sx(tick)} y1={TOP} y2={H - BOTTOM} className="stroke-border" />
                            <text x={sx(tick)} y={H - BOTTOM + 22} textAnchor="middle" fontSize={13} className="fill-muted-foreground">
                                {price(tick)}
                            </text>
                        </g>
                    ))}
                    {[0, 20, 40, 60, 80, 100].map(level => (
                        <g key={level}>
                            <line x1={LEFT} x2={W - RIGHT} y1={sy(level)} y2={sy(level)} className="stroke-border" />
                            <text x={LEFT - 8} y={sy(level) + 4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
                                {level}
                            </text>
                        </g>
                    ))}
                    {ordered.map(({ camera, x, y }) => {
                        const isFocus = camera.id === focus
                        return (
                            <a key={camera.id} href={`${BENCH.path}${camera.slug}/`} aria-label={camera.name}>
                                <circle
                                    cx={sx(x)}
                                    cy={sy(y)}
                                    r={isFocus ? 11 : 8}
                                    className={isFocus ? 'fill-foreground' : 'fill-muted-foreground'}
                                    fillOpacity={isFocus ? 1 : camera.id === hover ? 0.75 : 0.35}
                                    onMouseEnter={() => setHover(camera.id)}
                                    onMouseLeave={() => setHover(null)}
                                />
                            </a>
                        )
                    })}
                </svg>
                {hovered && at && (
                    <div
                        className="pointer-events-none absolute flex w-56 items-center gap-3 rounded-lg border bg-popover p-2 text-sm shadow-md"
                        style={{
                            ...(at.x < 55 ? { left: `calc(${at.x}% + 18px)` } : { right: `calc(${100 - at.x}% + 18px)` }),
                            ...(at.y < 50 ? { top: `max(0px, calc(${at.y}% - 24px))` } : { bottom: `max(0px, calc(${100 - at.y}% - 24px))` }),
                        }}
                    >
                        {hovered.camera.image.front && <img src={picture(hovered.camera.image.front)} alt="" className="size-12 object-contain" />}
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{hovered.camera.name.replace(`${hovered.camera.brand} `, '')}</span>
                            <span className="text-xs text-muted-foreground">
                                {hovered.camera.brand} / {year(hovered.camera) || '–'} / {price(hovered.x)}
                            </span>
                            <span className="text-xs">Spec level {hovered.y}</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                {focus ? (
                    <>
                        <span className="flex items-center gap-1.5">
                            <i className="size-2 rounded-full bg-foreground" />
                            {cameras.find(camera => camera.id === focus)?.name}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <i className="size-2 rounded-full bg-muted-foreground opacity-40" />
                            Other cameras
                        </span>
                    </>
                ) : (
                    <span className="flex items-center gap-1.5">
                        <i className="size-2 rounded-full bg-muted-foreground opacity-40" />
                        Cameras: hover a dot, click to open it
                    </span>
                )}
            </div>
        </div>
    )
}
