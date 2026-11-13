/**
 * Compare: two cameras side by side. Their pictures and spec levels, the level's areas as a radar and
 * as paired bars with the reason for each, and every spec with how well it is verified.
 */
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Popover, PopoverContent, PopoverTrigger, Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import type { ViewProps } from '@site/app'
import { BENCH, CAMERAS, type CameraSummary, type Reason, RUN, price, year } from '@site/data'
import { INK, TONE, TYPE } from '@site/kit/theme'
import { STATUS, smallPicture, useData } from '@site/readings'
import { useEffect, useState } from 'react'

/** What Compare loads for one camera: its level's reasons and every value with its standing. */
interface Compared {
    reasons: Reason[]
    facts: Record<string, { text: string | null; status: string; sources: number; conflicts: number }>
}

const SIDE_COLORS = [INK.accent, TONE.good]
const BRANDS = [...new Set(CAMERAS.map(camera => camera.brand))].sort()
const GROUPS = [...new Set(RUN.specs.map(spec => spec.group))]
const bySlug = (slug: string | null): CameraSummary | undefined => CAMERAS.find(camera => camera.slug === slug)

/** A searchable list of every camera, opened from the camera's name. */
function Picker({ camera, color, onPick }: { camera: CameraSummary; color: string; onPick: (slug: string) => void }) {
    const [open, setOpen] = useState(false)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className="flex max-w-full cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-left text-sm font-medium hover:bg-white/10">
                <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{camera.name}</span>
                <span className="text-muted-foreground">▾</span>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
                <Command>
                    <CommandInput placeholder="Find a camera" />
                    <CommandList>
                        <CommandEmpty>No camera by that name.</CommandEmpty>
                        {BRANDS.map(brand => (
                            <CommandGroup key={brand} heading={brand}>
                                {CAMERAS.filter(candidate => candidate.brand === brand).map(candidate => (
                                    <CommandItem
                                        key={candidate.slug}
                                        value={candidate.name}
                                        onSelect={() => {
                                            onPick(candidate.slug)
                                            setOpen(false)
                                        }}
                                    >
                                        {candidate.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

function Side({ camera, color, onPick }: { camera: CameraSummary; color: string; onPick: (slug: string) => void }) {
    const picture = smallPicture(camera, true)
    return (
        <div className="flex min-w-0 flex-col items-center gap-3 text-center">
            <Picker camera={camera} color={color} onPick={onPick} />
            <a href={`${BENCH.path}${camera.slug}/`} className="flex aspect-[4/3] w-full max-w-64 items-center justify-center" aria-label={`${camera.name}: every spec`}>
                {picture ? <img src={picture} alt="" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_24px_rgb(0_0_0/0.6)]" /> : <span className="text-xs text-muted-foreground">No picture yet</span>}
            </a>
            <div>
                <p className={`${TYPE.display} ${TYPE.number}`} style={{ color }}>
                    {camera.level ?? '–'}
                </p>
                <p className={TYPE.label}>Spec level</p>
            </div>
            <p className="text-sm text-muted-foreground">{[year(camera), price(camera.price)].filter(Boolean).join(' · ')}</p>
        </div>
    )
}

const RADAR = 300
const REACH = 104

/** Both cameras' areas on one wheel: further out is a higher score in that area. */
function Radar({ areas, sides }: { areas: string[]; sides: (Reason[] | undefined)[] }) {
    const centre = RADAR / 2
    const point = (index: number, score: number): [number, number] => {
        const angle = (index / areas.length) * Math.PI * 2 - Math.PI / 2
        return [centre + Math.cos(angle) * REACH * (score / 100), centre + Math.sin(angle) * REACH * (score / 100)]
    }
    const outline = (reasons: Reason[]): string => areas.map((area, index) => point(index, reasons.find(reason => reason.area === area)?.score ?? 0).join(',')).join(' ')
    return (
        <svg viewBox={`-45 0 ${RADAR + 90} ${RADAR}`} className="mx-auto w-full max-w-96" role="img" aria-label="Both cameras' scores in each area">
            {[25, 50, 75, 100].map(ring => (
                <polygon key={ring} points={areas.map((_, index) => point(index, ring).join(',')).join(' ')} fill="none" stroke={INK.grid} />
            ))}
            {areas.map((area, index) => {
                const [x, y] = point(index, 122)
                const [edgeX, edgeY] = point(index, 100)
                return (
                    <g key={area}>
                        <line x1={centre} y1={centre} x2={edgeX} y2={edgeY} stroke={INK.grid} />
                        <text x={x} y={y + 3} textAnchor={Math.abs(x - centre) < 12 ? 'middle' : x > centre ? 'start' : 'end'} fontSize={9.5} fill={INK.muted}>
                            {area.replace(' and battery', '').replace('Shutter and ISO', 'Shutter, ISO')}
                        </text>
                    </g>
                )
            })}
            {sides.map((reasons, index) => reasons && <polygon key={index} points={outline(reasons)} fill={SIDE_COLORS[index]} fillOpacity={0.16} stroke={SIDE_COLORS[index]} strokeWidth={1.5} strokeLinejoin="round" />)}
        </svg>
    )
}

/** One area: each camera's score as a bar growing out from the middle, with the reason under it. */
function AreaRow({ area, weight, sides }: { area: string; weight: number; sides: (Reason | undefined)[] }) {
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-x-3 py-2.5">
            {sides.map((reason, index) => (
                <div key={index} className={`flex min-w-0 flex-col gap-1 ${index === 0 ? 'col-start-1 items-end text-right' : 'col-start-3'}`} style={{ gridRow: 1 }}>
                    <span className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06]" style={{ justifyContent: index === 0 ? 'flex-end' : 'flex-start' }}>
                        <span className="h-full rounded-full transition-[width] duration-500" style={{ width: `${reason?.score ?? 0}%`, background: SIDE_COLORS[index] }} />
                    </span>
                    <span className="text-xs text-muted-foreground">{reason ? reason.why : 'Not known'}</span>
                </div>
            ))}
            <div className="col-start-2 row-start-1 w-24 text-center sm:w-36">
                <p className="text-xs font-medium sm:text-sm">{area}</p>
                <p className="text-[11px] text-muted-foreground">counts {weight}%</p>
            </div>
        </div>
    )
}

function Value({ fact }: { fact: Compared['facts'][string] | undefined }) {
    if (!fact) return <span className="text-muted-foreground">–</span>
    const status = STATUS[fact.status] ?? STATUS.single
    return (
        <span className="flex items-start gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: status.color }} title={`${status.label}${fact.conflicts ? `, ${fact.conflicts} say otherwise` : ''}`} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{fact.text ?? '–'}</span>
        </span>
    )
}

export default function CompareView(_: ViewProps) {
    const [slugs, setSlugs] = useState([CAMERAS[0].slug, CAMERAS[1].slug])
    const [only, setOnly] = useState('all')

    // A link can name the two cameras: ?a=sony-a7v&b=canon-r6iii.
    useEffect(() => {
        const query = new URLSearchParams(location.search)
        const first = bySlug(query.get('a'))
        const second = bySlug(query.get('b'))
        if (first || second) setSlugs(previous => [first?.slug ?? previous[0], second?.slug ?? previous[1]])
    }, [])

    function pick(side: number, slug: string): void {
        const next = slugs.map((current, index) => (index === side ? slug : current))
        setSlugs(next)
        history.replaceState(null, '', `${location.pathname}?a=${next[0]}&b=${next[1]}`)
    }

    const cameras = slugs.map(slug => bySlug(slug)!)
    const first = useData<Compared>(`cameras/${slugs[0]}.json`)
    const second = useData<Compared>(`cameras/${slugs[1]}.json`)
    const details = [first, second].map(loaded => (loaded instanceof Error ? undefined : loaded))
    const areas = [...new Map(details.flatMap(detail => detail?.reasons ?? []).map(reason => [reason.area, reason.weight])).entries()]
    const differs = (id: string): boolean => (details[0]?.facts[id]?.text ?? null) !== (details[1]?.facts[id]?.text ?? null)
    const failed = first instanceof Error || second instanceof Error

    return (
        <div className="h-full overflow-y-auto" style={{ background: INK.background }}>
            <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-6 sm:px-8">
                <div className="grid grid-cols-2 items-start gap-x-4 gap-y-6 lg:grid-cols-[1fr_24rem_1fr]">
                    <Side camera={cameras[0]} color={SIDE_COLORS[0]} onPick={slug => pick(0, slug)} />
                    <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:self-center">
                        <Radar areas={areas.map(([area]) => area)} sides={details.map(detail => detail?.reasons)} />
                    </div>
                    <Side camera={cameras[1]} color={SIDE_COLORS[1]} onPick={slug => pick(1, slug)} />
                </div>
                {failed && <p className="text-center text-sm text-muted-foreground">The details could not be loaded. Try again in a moment.</p>}

                <section className="flex flex-col gap-2">
                    <h2 className={TYPE.heading}>Area by area</h2>
                    <div className="divide-y divide-white/5">
                        {[...areas]
                            .sort((one, other) => other[1] - one[1])
                            .map(([area, weight]) => (
                                <AreaRow key={area} area={area} weight={weight} sides={details.map(detail => detail?.reasons.find(reason => reason.area === area))} />
                            ))}
                    </div>
                </section>

                <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className={TYPE.heading}>Spec by spec</h2>
                        <Tabs value={only} onValueChange={value => setOnly(String(value))}>
                            <TabsList aria-label="Which specs">
                                <TabsTrigger value="all">Every spec</TabsTrigger>
                                <TabsTrigger value="different">Only what differs</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {Object.entries(STATUS).map(([id, status]) => (
                            <span key={id} className="inline-flex items-center gap-1.5">
                                <span className="size-1.5 rounded-full" style={{ background: status.color }} />
                                {status.label}
                            </span>
                        ))}
                    </p>
                    <table className="w-full table-fixed border-collapse text-sm">
                        <colgroup>
                            <col className="w-[28%]" />
                            <col />
                            <col />
                        </colgroup>
                        <tbody>
                            {GROUPS.map(group => {
                                const specs = RUN.specs.filter(spec => spec.group === group && (only === 'all' || differs(spec.id)))
                                if (!specs.length) return null
                                return [
                                    <tr key={group}>
                                        <th colSpan={3} className={`${TYPE.label} pt-6 pb-2 text-left font-normal`}>
                                            {group}
                                        </th>
                                    </tr>,
                                    ...specs.map(spec => (
                                        <tr key={spec.id} className={`border-t border-white/5 align-top ${differs(spec.id) ? '' : 'text-muted-foreground'}`}>
                                            <td className="py-2 pr-3 text-muted-foreground">{spec.label}</td>
                                            {details.map((detail, index) => (
                                                <td key={index} className="py-2 pr-3 break-words" style={differs(spec.id) ? { boxShadow: `inset 2px 0 0 ${SIDE_COLORS[index]}`, paddingLeft: 10 } : { paddingLeft: 10 }}>
                                                    <Value fact={detail?.facts[spec.id]} />
                                                </td>
                                            ))}
                                        </tr>
                                    )),
                                ]
                            })}
                        </tbody>
                    </table>
                </section>
            </div>
        </div>
    )
}
