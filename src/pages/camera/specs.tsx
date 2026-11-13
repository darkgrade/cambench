/**
 * What the web says about one camera: every spec with its value, how it stands and who states it, and
 * a small grid of which sources back it and which differ. A spec opens to each source's quoted words.
 */
import { type CameraDetail, type CameraSummary, type Evidence, type Fact, RUN } from '@site/data'
import { TYPE } from '@site/kit/theme'
import { STANDING, STANDINGS, STATUS } from '@site/readings'
import { SOURCE_GROUPS, sourceGroup } from '@site/sources'

const NEED = RUN.need ?? 3
const SOURCE_TITLES = Object.fromEntries(RUN.sources.map(source => [source.key, source.title]))
const sourceTitle = (key: string): string => SOURCE_TITLES[key] ?? key.replace(/^(news|site):/, '')
const day = (at: string | undefined): string => (at ? new Date(at).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : '–')

/** How one of a fact's readings stands, as an index into STANDINGS. */
function standingOf(fact: Fact, differs: boolean): number {
    if (fact.status === 'quote') return STANDING.price
    if (fact.status === 'disputed') return STANDING.unsettled
    if (differs) return STANDING.differs
    return fact.status === 'verified' ? STANDING.verified : fact.status === 'likely' ? STANDING.likely : STANDING.single
}

/** A value's standing in words: how many independent sources state it. */
function standingText(fact: Fact): string {
    if (fact.status === 'verified') return `Verified · ${fact.owners.length} sources`
    if (fact.status === 'quote') return `Listed by ${fact.owners.length} ${fact.owners.length === 1 ? 'seller' : 'sellers'}`
    return STATUS[fact.status]?.label ?? fact.status
}

/** Every reading of this camera counted by how it stands, as one bar. */
function Tally({ facts }: { facts: Fact[] }) {
    const counts = STANDINGS.map(() => 0)
    for (const fact of facts) {
        counts[standingOf(fact, false)] += fact.evidence.length
        counts[standingOf(fact, true)] += fact.conflicts.length
    }
    const total = counts.reduce((sum, count) => sum + count, 0)
    if (!total) return null
    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex h-3 gap-px overflow-hidden rounded-full">
                {STANDINGS.map((standing, index) => counts[index] > 0 && <span key={standing.id} style={{ flexGrow: counts[index], background: standing.color }} />)}
            </div>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                {STANDINGS.map(
                    (standing, index) =>
                        counts[index] > 0 && (
                            <span key={standing.id} className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-full" style={{ background: standing.color }} />
                                {standing.label}
                                <span className={`${TYPE.number} text-foreground`}>{counts[index]}</span>
                            </span>
                        )
                )}
            </p>
        </div>
    )
}

/** One small square per source: lit in the color of how its reading stands, dark when it says nothing. */
function Backing({ fact, brand }: { fact: Fact | undefined; brand: string }) {
    const cells = SOURCE_GROUPS.map(() => -1)
    const mark = (item: Evidence, differs: boolean): void => {
        const group = sourceGroup(item.owner, item.owner === brand, item.source === 'news')
        // A source that differs anywhere shows as differing.
        if (fact && (cells[group] === -1 || differs)) cells[group] = standingOf(fact, differs)
    }
    fact?.evidence.forEach(item => mark(item, false))
    fact?.conflicts.forEach(item => mark(item, true))
    return (
        <span className="hidden gap-1 sm:flex" aria-hidden>
            {cells.map((standing, index) => (
                <span key={index} title={SOURCE_GROUPS[index].label} className="h-3.5 w-3 rounded-[2px]" style={{ background: standing < 0 ? 'oklch(1 0 0 / 0.06)' : STANDINGS[standing].color }} />
            ))}
        </span>
    )
}

function EvidenceLine({ evidence, differs }: { evidence: Evidence; differs: boolean }) {
    return (
        <div className="flex flex-col gap-1 border-l-2 pl-3" style={{ borderColor: differs ? STANDINGS[STANDING.differs].color : 'oklch(1 0 0 / 0.15)' }}>
            <span className="text-xs text-muted-foreground">
                {differs && (
                    <span className="font-medium" style={{ color: STANDINGS[STANDING.differs].color }}>
                        Differs:{' '}
                    </span>
                )}
                <span className="font-medium text-foreground">{sourceTitle(evidence.source)}</span> · {evidence.label} ·{' '}
                <a href={evidence.url} target="_blank" rel="noopener" className="underline">
                    page
                </a>{' '}
                · read {day(evidence.at)}
            </span>
            {evidence.raw && <code className="rounded bg-white/5 px-2 py-1 text-xs break-words whitespace-pre-wrap">{evidence.raw}</code>}
        </div>
    )
}

const ROW = 'grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] items-start gap-x-4 sm:grid-cols-[13rem_minmax(0,1fr)_auto_11rem]'

/** A spec's value, which opens to what each source says. */
function SpecRow({ label, tip, fact, brand }: { label: string; tip: string; fact: Fact | undefined; brand: string }) {
    if (!fact)
        return (
            <div className={`${ROW} border-t border-white/5 py-2.5 text-sm`}>
                <span className="text-muted-foreground" title={tip}>
                    {label}
                </span>
                <span className="text-muted-foreground">Not stated by any source</span>
                <Backing fact={undefined} brand={brand} />
                <span />
            </div>
        )
    const status = STATUS[fact.status] ?? STATUS.single
    const contested = fact.conflicts.length > 0
    return (
        <details className="group border-t border-white/5 open:bg-white/[0.025]" style={contested ? { boxShadow: `inset 2px 0 0 ${STANDINGS[fact.status === 'disputed' ? STANDING.unsettled : STANDING.differs].color}` } : undefined}>
            <summary className={`${ROW} cursor-pointer list-none py-2.5 text-sm ${contested ? 'pl-3' : ''} [&::-webkit-details-marker]:hidden`}>
                <span className="text-muted-foreground" title={tip}>
                    {label}
                </span>
                <span className="min-w-0 break-words">
                    {fact.items?.length ? (
                        <span className="flex flex-wrap gap-1.5">
                            {fact.items.map(item => (
                                <span key={item.text} className="rounded bg-white/[0.07] px-1.5 py-0.5 text-xs" title={item.owners.join(', ')}>
                                    {item.text} <span className="text-muted-foreground">{item.owners.length}</span>
                                </span>
                            ))}
                        </span>
                    ) : (
                        (fact.text ?? '–')
                    )}
                    {contested && (
                        <span className="mt-0.5 block text-xs" style={{ color: STANDINGS[fact.status === 'disputed' ? STANDING.unsettled : STANDING.differs].color }}>
                            {fact.conflicts.length} {fact.conflicts.length === 1 ? 'source says' : 'sources say'} otherwise
                        </span>
                    )}
                </span>
                <span className="pt-1">
                    <Backing fact={fact} brand={brand} />
                </span>
                <span className="col-span-3 flex items-center gap-1.5 pt-0.5 text-xs whitespace-nowrap text-muted-foreground sm:col-span-1 sm:justify-end sm:pt-0.5">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: status.color }} />
                    {standingText(fact)}
                </span>
            </summary>
            <div className={`flex flex-col gap-2 pr-3 pb-4 sm:pl-[14rem] ${contested ? 'pl-3' : ''}`}>
                <p className="text-xs text-muted-foreground">Stated by {fact.owners.join(', ')}</p>
                {fact.evidence.map((item, index) => (
                    <EvidenceLine key={`for-${index}`} evidence={item} differs={false} />
                ))}
                {fact.conflicts.map((item, index) => (
                    <EvidenceLine key={`against-${index}`} evidence={item} differs />
                ))}
            </div>
        </details>
    )
}

export function Specs({ camera, detail }: { camera: CameraSummary; detail: CameraDetail | undefined }) {
    const facts = detail?.facts ?? {}
    const groups = [...new Set(RUN.specs.map(spec => spec.group))]
    return (
        <section className="flex flex-col gap-5">
            <div>
                <h2 className={TYPE.title}>What the web says</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Every value with who states it. It is verified when {NEED} or more independent sources agree; where a source says otherwise the row is marked. Open a value to read each source's
                    own words.
                </p>
            </div>
            <Tally facts={Object.values(facts)} />
            <div>
                <div className={`${ROW} hidden items-end pb-1 sm:grid`}>
                    <span />
                    <span />
                    <span className="flex h-20 gap-1">
                        {SOURCE_GROUPS.map(group => (
                            <span key={group.id} className="relative w-3">
                                <span className="absolute bottom-0 left-1/2 origin-bottom-left -rotate-[58deg] text-[10px] leading-none whitespace-nowrap text-muted-foreground">{group.label}</span>
                            </span>
                        ))}
                    </span>
                    <span />
                </div>
                {groups.map(group => (
                    <div key={group}>
                        <h3 className={`${TYPE.label} pt-6 pb-2`}>{group}</h3>
                        {RUN.specs
                            .filter(spec => spec.group === group && !spec.id.startsWith('image_'))
                            .map(spec => (
                                <SpecRow key={spec.id} label={spec.label} tip={spec.tip} fact={facts[spec.id]} brand={camera.brand} />
                            ))}
                    </div>
                ))}
            </div>
        </section>
    )
}
