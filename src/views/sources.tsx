/**
 * Sources: who agrees with whom. How often each main source matches the values enough independent
 * sources agree on, how often each pair states the same thing, and where each differs spec by spec.
 * Picking a cell lists the actual differences, with each side's quoted words and its page.
 */
import agreement from '@site/agreement.json'
import type { ViewProps } from '@site/app'
import { BENCH, RUN } from '@site/data'
import facts from '@site/facts.json'
import { INK, TONE, TYPE } from '@site/kit/theme'
import { cameraOf, share, specOf, useData } from '@site/readings'
import { type ReactNode, useMemo, useState } from 'react'

const NEED = RUN.need ?? 3

/** The sources with enough readings to compare, with their place in the data's columns. Prices (the used market) are left out. */
const MAIN = facts.groups.filter(group => group.checked > 300).map(group => ({ ...group, index: agreement.groups.indexOf(group.id) }))
/** The specs two sites can differ about, with their place in the data's columns. */
const COMPARED = RUN.specs.map((spec, index) => ({ ...spec, index })).filter(spec => spec.group !== 'Price' && facts.specs[spec.index].readings > 0)

const pairShare = (first: number, second: number): number | undefined => (agreement.both[first][second] ? agreement.agree[first][second] / agreement.both[first][second] : undefined)
const PAIR_SHARES = MAIN.flatMap(first => MAIN.flatMap(second => (first === second ? [] : [pairShare(first.index, second.index) ?? 1])))
const LOWEST_PAIR = Math.min(...PAIR_SHARES)
const HIGHEST_PAIR = Math.max(...PAIR_SHARES)
const LOWEST_MATCH = Math.min(...MAIN.map(group => group.matched / group.checked))
/** The share of a source's readings of one spec that differ at which a cell is fully red. */
const FULL_DIFFERENCE = 0.25

type Selection = { kind: 'pair'; first: number; second: number } | { kind: 'spec'; group: number; spec: number }

/** One reading in a disagreement: [source group, owner, value number (0 is the listed value), page, quoted words]. */
type Entry = [number, number, number, number, string]

interface Disagreement {
    camera: number
    spec: number
    /** False when no value has enough sources behind it. */
    settled: boolean
    value: string
    entries: Entry[]
}

interface Disagreements {
    /** Camera slugs and spec ids, by the positions the items name. */
    cameras: string[]
    specs: string[]
    urls: string[]
    owners: string[]
    items: Disagreement[]
}

function Section({ title, children, lead }: { title: string; lead: ReactNode; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-4">
            <div>
                <h2 className={TYPE.heading}>{title}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lead}</p>
            </div>
            {children}
        </section>
    )
}

/** Each main source as a dot on one zoomed-in scale: how often it matches a verified value. */
function Matches() {
    const floor = Math.floor(LOWEST_MATCH * 100 - 1) / 100
    const sorted = [...MAIN].sort((first, second) => second.matched / second.checked - first.matched / first.checked)
    const position = (value: number): string => `${((value - floor) / (1 - floor)) * 100}%`
    return (
        <div className="flex max-w-2xl flex-col gap-1.5">
            {sorted.map(group => (
                <div key={group.id} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="truncate">{group.label}</span>
                    <span className="relative h-5">
                        <span className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                        <span className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full" style={{ left: 0, width: position(group.matched / group.checked), background: TONE.good, opacity: 0.45 }} />
                        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: position(group.matched / group.checked), background: TONE.good }} />
                    </span>
                    <span className={`${TYPE.number} text-right`}>{share(group.matched, group.checked)}</span>
                </div>
            ))}
            <div className="grid grid-cols-[6.5rem_1fr_3rem] gap-3 text-[11px] text-muted-foreground">
                <span />
                <span className="flex justify-between">
                    <span>{Math.round(floor * 100)}%</span>
                    <span>100%</span>
                </span>
                <span />
            </div>
        </div>
    )
}

function Matrix({ selection, onSelect }: { selection: Selection | undefined; onSelect: (selection: Selection) => void }) {
    return (
        <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5 text-xs">
                <thead>
                    <tr>
                        <th />
                        {MAIN.map(group => (
                            <th key={group.id} className="h-24 w-11 align-bottom font-normal text-muted-foreground">
                                <span className="block origin-bottom-left translate-x-6 -rotate-45 text-left whitespace-nowrap">{group.label}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {MAIN.map(row => (
                        <tr key={row.id}>
                            <th className="pr-3 text-right font-normal whitespace-nowrap text-muted-foreground">{row.label}</th>
                            {MAIN.map(column => {
                                const value = pairShare(row.index, column.index)
                                if (row === column || value === undefined) return <td key={column.id} className="size-11 rounded-sm bg-white/[0.03]" />
                                const strength = (value - LOWEST_PAIR) / (HIGHEST_PAIR - LOWEST_PAIR)
                                const picked = selection?.kind === 'pair' && ((selection.first === row.index && selection.second === column.index) || (selection.first === column.index && selection.second === row.index))
                                return (
                                    <td key={column.id} className="p-0">
                                        <button
                                            type="button"
                                            onClick={() => onSelect({ kind: 'pair', first: row.index, second: column.index })}
                                            aria-label={`${row.label} and ${column.label} agree ${share(value, 1)} of the time`}
                                            aria-pressed={picked}
                                            className={`${TYPE.number} flex size-11 cursor-pointer items-center justify-center rounded-sm text-[11px] outline-offset-1 hover:outline hover:outline-white/60 ${picked ? 'outline outline-2 outline-white' : ''}`}
                                            style={{ background: `color-mix(in oklch, ${TONE.good} ${Math.round(12 + strength * 70)}%, ${INK.surface})`, color: strength > 0.55 ? INK.background : INK.text }}
                                        >
                                            {(value * 100).toFixed(1)}
                                        </button>
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function SpecGrid({ selection, onSelect }: { selection: Selection | undefined; onSelect: (selection: Selection) => void }) {
    return (
        <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5 text-xs">
                <thead>
                    <tr>
                        <th />
                        {MAIN.map(group => (
                            <th key={group.id} className="h-24 w-9 align-bottom font-normal text-muted-foreground">
                                <span className="block origin-bottom-left translate-x-5 -rotate-45 text-left whitespace-nowrap">{group.label}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {COMPARED.map((spec, position) => {
                        const starts = position === 0 || COMPARED[position - 1].group !== spec.group
                        return (
                            <tr key={spec.id}>
                                <th className={`pr-3 text-right font-normal whitespace-nowrap text-muted-foreground ${starts && position > 0 ? 'pt-3' : ''}`}>{spec.label}</th>
                                {MAIN.map(group => {
                                    const [stated, differing] = agreement.grid[group.index][spec.index]
                                    const picked = selection?.kind === 'spec' && selection.group === group.index && selection.spec === spec.index
                                    const strength = stated ? Math.min(1, differing / stated / FULL_DIFFERENCE) : 0
                                    const cell = `flex h-6 w-9 items-center justify-center rounded-sm text-[10px] ${TYPE.number}`
                                    return (
                                        <td key={group.id} className={`p-0 ${starts && position > 0 ? 'pt-3' : ''}`}>
                                            {differing > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect({ kind: 'spec', group: group.index, spec: spec.index })}
                                                    aria-label={`${group.label} on ${spec.label}: ${differing} of ${stated} differ`}
                                                    aria-pressed={picked}
                                                    className={`${cell} cursor-pointer outline-offset-1 hover:outline hover:outline-white/60 ${picked ? 'outline outline-2 outline-white' : ''}`}
                                                    style={{ background: `color-mix(in oklch, ${TONE.bad} ${Math.round(18 + strength * 72)}%, ${INK.surface})` }}
                                                >
                                                    {differing}
                                                </button>
                                            ) : (
                                                <span className={cell} style={{ background: stated ? `color-mix(in oklch, ${TONE.good} 14%, ${INK.surface})` : 'oklch(1 0 0 / 0.03)' }} />
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

/** What one side says: who, the words read from its page, and the page. */
function Said({ entry, data, differs }: { entry: Entry; data: Disagreements; differs: boolean }) {
    return (
        <p className="border-l-2 pl-3 text-xs leading-relaxed" style={{ borderColor: differs ? TONE.bad : TONE.good }}>
            <span className="font-medium text-foreground">{data.owners[entry[1]]}</span>{' '}
            <a href={data.urls[entry[3]]} target="_blank" rel="noopener" className="text-muted-foreground underline decoration-white/30 hover:text-foreground">
                page
            </a>
            <span className="block text-foreground/80">“{entry[4]}”</span>
        </p>
    )
}

function Differences({ selection, onClose }: { selection: Selection; onClose: () => void }) {
    const loaded = useData<Disagreements>('disagreements.json')
    const data = loaded instanceof Error ? undefined : loaded
    const label = (index: number): string => facts.groups[index].label
    const title = selection.kind === 'pair' ? `${label(selection.first)} and ${label(selection.second)}` : `${label(selection.group)} on ${RUN.specs[selection.spec].label.replace(/ \(.*\)$/, '').toLowerCase()}`

    const shown = useMemo(() => {
        if (!data) return []
        return data.items.flatMap(item => {
            if (selection.kind === 'spec') {
                if (item.spec !== selection.spec) return []
                const theirs = item.entries.filter(entry => entry[0] === selection.group && entry[2] > 0)
                const agreed = item.entries.filter(entry => entry[2] === 0).slice(0, 2)
                return theirs.length ? [{ item, sides: [...theirs, ...agreed] }] : []
            }
            const first = item.entries.filter(entry => entry[0] === selection.first)
            const second = item.entries.filter(entry => entry[0] === selection.second)
            const apart = first.some(one => second.some(other => one[2] !== other[2]))
            return apart ? [{ item, sides: [...first, ...second] }] : []
        })
    }, [data, selection])

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
                <div>
                    <p className={TYPE.label}>Where they differ</p>
                    <h2 className={TYPE.heading}>{title}</h2>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer px-2 text-lg leading-none text-muted-foreground hover:text-foreground lg:hidden">
                    ×
                </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-5">
                {loaded instanceof Error && <p className="text-sm text-muted-foreground">The quotes could not be loaded. Try again in a moment.</p>}
                {!loaded && <p className="text-sm text-muted-foreground">Loading what each side says…</p>}
                {data && shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing to show here.</p>}
                {data &&
                    shown.map(({ item, sides }) => {
                        const camera = cameraOf(data.cameras[item.camera])
                        const spec = specOf(data.specs[item.spec])
                        return (
                            <article key={`${item.camera}-${item.spec}`} className="flex flex-col gap-2">
                                <div>
                                    <a href={`${BENCH.path}${camera.slug}/`} className="text-sm font-medium hover:underline">
                                        {camera.name}
                                    </a>
                                    <p className="text-xs text-muted-foreground">
                                        {spec.label} · {item.settled ? 'agreed value' : 'no agreement yet, most say'} <span className="text-foreground">{item.value}</span>
                                    </p>
                                </div>
                                {sides.map((entry, index) => (
                                    <Said key={index} entry={entry} data={data} differs={entry[2] > 0} />
                                ))}
                            </article>
                        )
                    })}
            </div>
        </div>
    )
}

export default function SourcesView(_: ViewProps) {
    const [selection, setSelection] = useState<Selection>()
    const best = [...MAIN].sort((first, second) => second.matched / second.checked - first.matched / first.checked)[0]
    return (
        <div className="relative flex h-full" style={{ background: INK.background }}>
            <div className="min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-6 sm:px-8">
                    <div>
                        <h2 className={TYPE.title}>Who agrees with whom</h2>
                        <p className={`${TYPE.body} mt-2 max-w-2xl`}>
                            No single site is the truth about a camera, including its maker's. Here is how the main sources line up against each other, and exactly where they part ways.
                        </p>
                    </div>
                    <Section
                        title="How often each source matches"
                        lead={`Of the values ${NEED} or more independent sources agree on, the share each source states the same way. ${best.label} is closest at ${share(best.matched, best.checked)}, and none is far behind.`}
                    >
                        <Matches />
                    </Section>
                    <Section title="How often two sources say the same thing" lead="For every spec both state about the same camera, the share where they state the same value. Brighter is closer. Pick a pair to read where they differ.">
                        <Matrix selection={selection} onSelect={setSelection} />
                    </Section>
                    <Section title="Where each source differs" lead="How many of a source's readings of each spec differ from the agreed value. Redder is a larger share. Pick a number to read them.">
                        <SpecGrid selection={selection} onSelect={setSelection} />
                    </Section>
                </div>
            </div>
            {selection ? (
                <aside className="absolute inset-x-0 bottom-0 z-10 h-[62%] rounded-t-xl border-t border-white/10 bg-[oklch(0.17_0.006_285)] shadow-2xl lg:static lg:h-auto lg:w-[26rem] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none">
                    <Differences selection={selection} onClose={() => setSelection(undefined)} />
                </aside>
            ) : (
                <aside className="hidden w-[26rem] shrink-0 items-center justify-center border-l border-white/10 px-10 text-center text-sm text-muted-foreground lg:flex">
                    Pick a pair of sources, or a number in the grid, to read what each side says.
                </aside>
            )}
        </div>
    )
}
