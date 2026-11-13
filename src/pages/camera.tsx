/**
 * One camera's own page: its pictures and spec level, what makes up the level against the middle of
 * the field, every spec with who states it, its true size, where it sits among the others, and the
 * cameras nearest it. Everything is in the prerendered page; nothing here waits on a request.
 */
import { Stat, Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import { BENCH, CAMERAS, type CameraDetail, type CameraSummary, type Reason, picture, price, year } from '@site/data'
import facts from '@site/facts.json'
import { INK, TYPE } from '@site/kit/theme'
import { BodySize } from '@site/pages/camera/body'
import { Specs } from '@site/pages/camera/specs'
import { LevelChart } from '@site/pages/level-chart'
import { smallPicture } from '@site/readings'
import { useState } from 'react'

const day = (at: string | undefined): string => (at ? new Date(at).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : '–')
const MEDIANS = new Map(facts.areas.map(area => [area.area, area.median]))
const RING = 2 * Math.PI * 52

/** The camera's pictures on a soft light, front first; the back is a tab away. */
function Pictures({ camera }: { camera: CameraSummary }) {
    const sides = (['front', 'back'] as const).filter(side => camera.image[side])
    const [side, setSide] = useState<'front' | 'back'>(sides[0] ?? 'front')
    if (!sides.length)
        return (
            <div className="flex aspect-[4/3] items-center justify-center rounded-3xl border border-dashed border-white/15 text-sm text-muted-foreground">No picture yet</div>
        )
    return (
        <div className="flex flex-col items-center gap-3">
            <figure className="relative flex aspect-[4/3] w-full items-center justify-center" style={{ background: 'radial-gradient(closest-side, oklch(1 0 0 / 0.09), transparent)' }}>
                {sides.map(item => (
                    <img
                        key={item}
                        src={picture(camera.image[item])}
                        alt={`${camera.name}, ${item}`}
                        loading={item === sides[0] ? 'eager' : 'lazy'}
                        className={`absolute inset-0 size-full object-contain p-4 drop-shadow-[0_24px_40px_rgb(0_0_0/0.7)] transition-opacity duration-300 sm:p-8 ${item === side ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                    />
                ))}
            </figure>
            {sides.length > 1 && (
                <Tabs value={side} onValueChange={value => setSide(value === 'back' ? 'back' : 'front')}>
                    <TabsList aria-label="Side">
                        <TabsTrigger value="front">Front</TabsTrigger>
                        <TabsTrigger value="back">Back</TabsTrigger>
                    </TabsList>
                </Tabs>
            )}
        </div>
    )
}

/** The spec level as a ring that fills toward 100. */
function LevelRing({ level, rank }: { level: number | null; rank: number }) {
    return (
        <div className="relative size-36 shrink-0">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
                <circle cx={60} cy={60} r={52} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth={7} />
                <circle cx={60} cy={60} r={52} fill="none" stroke={INK.accent} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${((level ?? 0) / 100) * RING} ${RING}`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`${TYPE.number} font-heading text-5xl leading-none font-semibold`}>{level ?? '–'}</span>
                <span className={`${TYPE.label} mt-1.5`}>Spec level</span>
                <span className="text-[11px] text-muted-foreground">
                    #{rank} of {CAMERAS.length}
                </span>
            </div>
        </div>
    )
}

/** What makes up the level: each area's score as a bar, with a tick where the middle camera sits. */
function LevelAreas({ reasons, missing }: { reasons: Reason[]; missing: string[] }) {
    return (
        <div className="flex flex-col">
            {[...reasons]
                .sort((first, second) => second.weight - first.weight)
                .map(reason => {
                    const median = MEDIANS.get(reason.area)
                    return (
                        <div key={reason.area} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-white/5 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1.1fr)_5.5rem]">
                            <span className="col-start-1 row-start-1 text-sm font-medium">{reason.area}</span>
                            <span className="col-span-2 col-start-1 row-start-2 text-sm text-muted-foreground sm:col-span-1 sm:col-start-2 sm:row-start-1">{reason.why}</span>
                            <span className="relative col-span-2 col-start-1 row-start-3 h-2 rounded-full bg-white/[0.07] sm:col-span-1 sm:col-start-3 sm:row-start-1">
                                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${reason.score}%`, background: median !== undefined && reason.score >= median ? INK.accent : INK.muted }} />
                                {median !== undefined && <span className="absolute -inset-y-1 w-0.5 rounded-full bg-white" style={{ left: `${median}%` }} title="The middle camera" />}
                            </span>
                            <span className={`${TYPE.number} col-start-2 row-start-1 text-right text-xs text-muted-foreground sm:col-start-4`}>
                                {reason.points} of {reason.weight}
                            </span>
                        </div>
                    )
                })}
            {missing.map(area => (
                <div key={area} className="grid grid-cols-[10rem_1fr] gap-x-4 border-t border-white/5 py-2.5 text-sm">
                    <span className="font-medium">{area}</span>
                    <span className="text-muted-foreground">Not known, so left out; the rest count for more</span>
                </div>
            ))}
        </div>
    )
}

/** The cameras nearest this one in price and spec level. */
function rivals(camera: CameraSummary): CameraSummary[] {
    if (camera.price === null || camera.level === null) return []
    const distance = (other: CameraSummary): number => Math.hypot(Math.log(other.price! / camera.price!) / Math.log(1.4), (other.level! - camera.level!) / 8)
    return CAMERAS.filter(other => other.slug !== camera.slug && other.price !== null && other.level !== null)
        .sort((first, second) => distance(first) - distance(second))
        .slice(0, 4)
}

function Rival({ camera, rival }: { camera: CameraSummary; rival: CameraSummary }) {
    const thumbnail = smallPicture(rival, true)
    return (
        <li className="flex flex-col gap-3 rounded-xl bg-white/[0.04] p-4">
            <a href={`${BENCH.path}${rival.slug}/`} className="group flex flex-col gap-3">
                <span className="flex aspect-[4/3] items-center justify-center">
                    {thumbnail ? <img src={thumbnail} alt="" loading="lazy" className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105" /> : <span className="text-xs text-muted-foreground">No picture yet</span>}
                </span>
                <span>
                    <span className="block text-sm font-medium group-hover:underline">{rival.name}</span>
                    <span className="block text-xs text-muted-foreground">
                        {price(rival.price)} · spec level {rival.level}
                    </span>
                </span>
            </a>
            <a href={`${BENCH.path}compare/?a=${camera.slug}&b=${rival.slug}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                Compare the two →
            </a>
        </li>
    )
}

/** One camera: its pictures, spec level and why, every spec with its sources and their words, and every page read. */
export function CameraPage({ camera, detail }: { camera: CameraSummary; detail: CameraDetail | undefined }) {
    const position = CAMERAS.indexOf(camera)
    const specs = detail?.facts ?? {}
    const money = (id: string) => price(typeof specs[id]?.value === 'number' ? (specs[id].value as number) : null)
    const near = rivals(camera)
    const above = CAMERAS[position - 1]
    const below = CAMERAS[position + 1]
    return (
        <article className="mx-auto flex max-w-6xl flex-col gap-16 px-4 pt-4 pb-16 sm:px-8">
            <header className="grid items-center gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <Pictures camera={camera} />
                <div className="flex flex-col gap-5">
                    <a href={BENCH.path} className="text-sm text-muted-foreground hover:underline">
                        ← All cameras
                    </a>
                    <div>
                        <h1 className="font-heading text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">{camera.name}</h1>
                        <p className="mt-3 text-sm text-muted-foreground">
                            {[camera.brand, specs.type?.text, specs.mount?.text, specs.announced?.text && `released ${specs.announced.text}`].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
                        <LevelRing level={camera.level} rank={position + 1} />
                        <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4">
                            <Stat label="MSRP" value={money('msrp')} />
                            <Stat label="New" value={money('price_new')} />
                            <Stat label="Used" value={money('price_used')} />
                            <Stat label="Sensor" value={specs.mp?.text ?? '–'} sub={(specs.sensor?.text ?? '').split(' (')[0]} />
                        </div>
                    </div>
                </div>
            </header>

            <section className="flex flex-col gap-5">
                <div>
                    <h2 className={TYPE.title}>Spec level</h2>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        What makes up its level, area by area. The white tick is the middle camera of the {CAMERAS.length}; a gold bar is at or past it.
                    </p>
                </div>
                {detail?.level?.reasons?.length ? <LevelAreas reasons={detail.level.reasons} missing={detail.level.missing ?? []} /> : null}
            </section>

            <Specs camera={camera} detail={detail} />

            <BodySize camera={camera} />

            <section className="flex flex-col gap-5">
                <div>
                    <h2 className={TYPE.title}>Among the others</h2>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Where it sits for its price: further up is more camera, further left costs less.</p>
                </div>
                <LevelChart focus={camera.id} />
                {near.length > 0 && (
                    <>
                        <h3 className={TYPE.heading}>Nearest in price and level</h3>
                        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {near.map(rival => (
                                <Rival key={rival.slug} camera={camera} rival={rival} />
                            ))}
                        </ul>
                    </>
                )}
            </section>

            {detail?.sources?.length ? (
                <section className="flex flex-col gap-4">
                    <div>
                        <h2 className={TYPE.title}>Sources</h2>
                        <p className="mt-2 text-sm text-muted-foreground">Every page read for this camera, and when it was read.</p>
                    </div>
                    <ul>
                        {detail.sources.map(source => (
                            <li key={source.url} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-white/5 py-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                                <span>{source.title}</span>
                                <a href={source.url} target="_blank" rel="noopener" className="col-span-2 row-start-2 truncate text-muted-foreground underline decoration-white/20 hover:text-foreground sm:col-span-1 sm:row-start-1">
                                    {source.url}
                                </a>
                                <span className="text-right text-muted-foreground">{day(source.scrapedAt)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <nav className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6 text-sm" aria-label="Other cameras">
                {above ? (
                    <a href={`${BENCH.path}${above.slug}/`} className="group flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">← One place higher</span>
                        <span className="font-medium group-hover:underline">{above.name}</span>
                    </a>
                ) : (
                    <span />
                )}
                {below && (
                    <a href={`${BENCH.path}${below.slug}/`} className="group flex flex-col items-end gap-0.5 text-right">
                        <span className="text-xs text-muted-foreground">One place lower →</span>
                        <span className="font-medium group-hover:underline">{below.name}</span>
                    </a>
                )}
            </nav>
        </article>
    )
}
