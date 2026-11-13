/** One camera's true size: the body beside its nearest neighbours in width at one scale, and its sensor among the other formats. */
import { BODIES, millimetres, sensorOf } from '@site/bodies'
import { BENCH, CAMERAS, type CameraSummary } from '@site/data'
import { INK, TYPE } from '@site/kit/theme'
import { shortName, smallPicture } from '@site/readings'

/** Millimetres left between two bodies standing side by side. */
const BETWEEN = 14
/** One sensor of each format among the cameras, largest first, to draw behind a camera's own for scale. */
const FORMATS = [...new Map(CAMERAS.flatMap(camera => (sensorOf(camera) ? [[sensorOf(camera)!.format, sensorOf(camera)!] as const] : []))).values()].sort((first, second) => second.width - first.width)
const BY_WIDTH = CAMERAS.filter(camera => BODIES[camera.slug]?.width !== undefined && camera.image.front).sort((first, second) => BODIES[first.slug].width! - BODIES[second.slug].width!)

/** The pictured cameras just narrower and just wider than this one. */
function neighbours(camera: CameraSummary): CameraSummary[] {
    const width = BODIES[camera.slug].width!
    const others = BY_WIDTH.filter(other => other.slug !== camera.slug)
    const narrower = others.filter(other => BODIES[other.slug].width! <= width).at(-1)
    const wider = others.find(other => BODIES[other.slug].width! > width)
    return [narrower, camera, wider].filter((item): item is CameraSummary => item !== undefined)
}

/** A body standing on the line. Its share of the row is its width in millimetres, so every body is at one scale. */
function Standing({ camera, own }: { camera: CameraSummary; own: boolean }) {
    const body = BODIES[camera.slug]
    const picture = smallPicture(camera, true)
    return (
        <div className="min-w-0" style={{ flex: `${body.width} 1 0` }}>
            {picture && body.aspect ? (
                <img src={picture} alt={own ? `${camera.name}, front` : ''} loading="lazy" className="block w-full" style={{ aspectRatio: body.aspect, opacity: own ? 1 : 0.5 }} />
            ) : (
                <span className="block w-full rounded-t-lg border border-b-0 border-dashed border-white/30" style={{ aspectRatio: body.width! / body.height! }} />
            )}
        </div>
    )
}

/** Under a body: how wide it is, and which camera it is. */
function Caption({ camera, own }: { camera: CameraSummary; own: boolean }) {
    return (
        <div className="flex min-w-0 flex-col items-center text-center" style={{ flex: `${BODIES[camera.slug].width} 1 0` }}>
            <span className={`${TYPE.number} text-[11px] text-muted-foreground`}>{millimetres(BODIES[camera.slug].width!)} mm</span>
            {own ? (
                <span className="max-w-full truncate text-xs font-medium">{shortName(camera)}</span>
            ) : (
                <a href={`${BENCH.path}${camera.slug}/`} className="max-w-full truncate text-xs text-muted-foreground hover:text-foreground hover:underline">
                    {shortName(camera)}
                </a>
            )}
        </div>
    )
}

export function BodySize({ camera }: { camera: CameraSummary }) {
    const body = BODIES[camera.slug]
    const sensor = sensorOf(camera)
    const row = body?.width !== undefined ? neighbours(camera) : []
    const span = Math.max(...FORMATS.map(format => format.width), sensor?.width ?? 0)
    const rise = Math.max(...FORMATS.map(format => format.height), sensor?.height ?? 0)
    return (
        <section className="flex flex-col gap-5">
            <div>
                <h2 className={TYPE.title}>True size</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    {body?.width !== undefined
                        ? `${millimetres(body.width)} × ${millimetres(body.height!)} × ${millimetres(body.depth!)} mm${body.weight ? `, ${Math.round(body.weight)} g with battery and card` : ''}. Drawn at one scale beside the cameras nearest it in width.`
                        : 'Its sources do not yet agree on its dimensions, so it is not drawn to scale.'}
                </p>
            </div>
            <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                {row.length > 0 && (
                    <div className="max-w-2xl">
                        <div className="flex items-end border-b border-white/30">
                            {row.flatMap((item, index) => [...(index > 0 ? [<span key={`gap-${item.slug}`} style={{ flex: `${BETWEEN} 1 0` }} />] : []), <Standing key={item.slug} camera={item} own={item.slug === camera.slug} />])}
                        </div>
                        <div className="flex items-start pt-2">
                            {row.flatMap((item, index) => [...(index > 0 ? [<span key={`gap-${item.slug}`} style={{ flex: `${BETWEEN} 1 0` }} />] : []), <Caption key={item.slug} camera={item} own={item.slug === camera.slug} />])}
                        </div>
                    </div>
                )}
                {sensor && (
                    <div className="flex flex-col gap-3">
                        <svg viewBox={`-1 -1 ${span + 2} ${rise + 2}`} className="w-full max-w-72" role="img" aria-label={`The sensor, ${millimetres(sensor.width)} by ${millimetres(sensor.height)} mm, among the other formats`}>
                            {FORMATS.map((format, index) => (
                                <g key={format.format}>
                                    <rect x={(span - format.width) / 2} y={(rise - format.height) / 2} width={format.width} height={format.height} rx={0.6} fill="none" stroke={INK.axis} strokeWidth={0.2} strokeDasharray="0.8 0.8" />
                                    <text x={(span - format.width) / 2 + 0.8} y={index % 2 ? (rise + format.height) / 2 - 1 : (rise - format.height) / 2 + 2.2} fontSize={1.5} fill={INK.muted}>
                                        {format.format}
                                    </text>
                                </g>
                            ))}
                            <rect x={(span - sensor.width) / 2} y={(rise - sensor.height) / 2} width={sensor.width} height={sensor.height} rx={0.6} fill={INK.accent} fillOpacity={0.16} stroke={INK.accent} strokeWidth={0.35} />
                        </svg>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                                {sensor.format} sensor, {millimetres(sensor.width)} × {millimetres(sensor.height)} mm
                            </span>
                            <br />
                            Dashed: the other sensor formats, at the same scale
                        </p>
                    </div>
                )}
            </div>
        </section>
    )
}
