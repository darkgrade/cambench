import { Stat, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kevinschaich/components'
import { BENCH, CAMERAS, type CameraDetail, type CameraSummary, type Evidence, type Fact, RUN, picture, price } from '@site/data'

const NEED = RUN.need ?? 3
const SOURCE_TITLES = Object.fromEntries(RUN.sources.map(source => [source.key, source.title]))
const sourceTitle = (key: string): string => SOURCE_TITLES[key] ?? key.replace(/^(news|site):/, '')
const day = (at: string | undefined): string => (at ? new Date(at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '–')

/** The dot beside a value: green when enough independent sources agree, amber for two, grey for one, red when sources disagree. */
function Dot({ fact }: { fact: Fact }) {
    const tone = fact.conflicts.length ? 'bg-red-500' : fact.owners.length >= NEED ? 'bg-green-500' : fact.owners.length === 2 ? 'bg-amber-500' : 'bg-muted-foreground'
    const meaning = fact.conflicts.length ? 'sources disagree' : fact.owners.length >= NEED ? 'verified' : `${fact.owners.length} source${fact.owners.length === 1 ? '' : 's'}`
    return <span className={`inline-block size-2 shrink-0 rounded-full ${tone}`} title={meaning} aria-label={meaning} />
}

/** Who states a value: its most reliable source, and how many others agree. */
function Agreement({ fact }: { fact: Fact }) {
    if (!fact.owners.length) return <span className="text-muted-foreground">–</span>
    const others = fact.owners.length - 1
    return (
        <span className="flex items-center justify-end gap-2 whitespace-nowrap" title={fact.owners.join(', ')}>
            <Dot fact={fact} />
            <span>
                {fact.owners[0]}
                {others > 0 && <span className="text-muted-foreground"> + {others} other{others === 1 ? '' : 's'}</span>}
            </span>
        </span>
    )
}

function EvidenceLine({ evidence, disagrees }: { evidence: Evidence; disagrees?: boolean }) {
    return (
        <div className="flex flex-col gap-1 border-l-2 border-border pl-3">
            <span className="text-xs text-muted-foreground">
                {disagrees && <span className="font-medium text-red-500">Disagrees: </span>}
                <span className="font-medium text-foreground">{sourceTitle(evidence.source)}</span> · {evidence.label} ·{' '}
                <a href={evidence.url} target="_blank" rel="noopener" className="underline">
                    page
                </a>{' '}
                · scraped {day(evidence.at)}
            </span>
            {evidence.raw && <code className="whitespace-pre-wrap break-words rounded bg-muted px-2 py-1 text-xs">{evidence.raw}</code>}
        </div>
    )
}

/** A spec's value, which opens to every source's evidence. */
function SpecRow({ label, tip, fact }: { label: string; tip: string; fact: Fact | undefined }) {
    const value = !fact ? (
        <span className="text-muted-foreground">Not stated by any source</span>
    ) : fact.items?.length ? (
        <span className="flex flex-wrap gap-1.5">
            {fact.items.map(item => (
                <span key={item.text} className="rounded bg-muted px-1.5 py-0.5 text-xs" title={item.owners.join(', ')}>
                    {item.text} <span className="text-muted-foreground">{item.owners.length}</span>
                </span>
            ))}
        </span>
    ) : (
        fact.text ?? '–'
    )
    const evidence = fact ? [...fact.evidence.map(item => ({ item, disagrees: false })), ...fact.conflicts.map(item => ({ item, disagrees: true }))] : []
    return (
        <TableRow className="align-top">
            <TableCell className="w-1/4 text-muted-foreground" title={tip}>
                {label}
            </TableCell>
            <TableCell>
                {evidence.length ? (
                    <details className="group">
                        <summary className="cursor-pointer list-none">{value}</summary>
                        <div className="mt-3 flex flex-col gap-2">
                            {evidence.map(({ item, disagrees }, index) => (
                                <EvidenceLine key={index} evidence={item} disagrees={disagrees} />
                            ))}
                        </div>
                    </details>
                ) : (
                    value
                )}
            </TableCell>
            <TableCell className="w-1/4 text-right">{fact ? <Agreement fact={fact} /> : null}</TableCell>
        </TableRow>
    )
}

/** One camera: its pictures, spec level and why, every spec with its sources and their evidence, and every page read. */
export function CameraPage({ camera, detail }: { camera: CameraSummary; detail: CameraDetail | undefined }) {
    const rank = CAMERAS.indexOf(camera) + 1
    const groups = [...new Set(RUN.specs.map(spec => spec.group))]
    const facts = detail?.facts ?? {}
    const money = (id: string) => price(typeof facts[id]?.value === 'number' ? (facts[id].value as number) : null)
    return (
        <article className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <a href={BENCH.path} className="text-sm text-muted-foreground hover:underline">
                    ← All cameras
                </a>
                <h1 className="font-heading text-3xl font-semibold tracking-tight">{camera.name}</h1>
                <span className="text-sm text-muted-foreground">
                    {[camera.brand, facts.type?.text, facts.mount?.text, facts.announced?.text && `released ${facts.announced.text}`].filter(Boolean).join(' · ')}
                </span>
            </div>

            {(camera.image.front || camera.image.back) && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {(['front', 'back'] as const)
                        .filter(side => camera.image[side])
                        .map(side => (
                            <div key={side} className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted p-6">
                                <img src={picture(camera.image[side])} alt={`${camera.name}, ${side}`} className="max-h-full max-w-full object-contain" />
                            </div>
                        ))}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat boxed size="lg" label="Spec level" value={camera.level ?? '–'} unit="/ 100" sub={`#${rank} of ${CAMERAS.length}`} />
                <Stat boxed size="lg" label="MSRP" value={money('msrp')} />
                <Stat boxed size="lg" label="New" value={money('price_new')} />
                <Stat boxed size="lg" label="Used" value={money('price_used')} />
                <Stat boxed size="lg" label="Sensor" value={facts.mp?.text ?? '–'} sub={(facts.sensor?.text ?? '').split(' (')[0]} />
            </div>

            {detail?.level?.reasons?.length ? (
                <section className="flex flex-col gap-3">
                    <h2 className="font-heading text-xl font-semibold">How the spec level adds up</h2>
                    <div className="flex flex-col gap-2">
                        {[...detail.level.reasons]
                            .sort((first, second) => second.weight - first.weight)
                            .map(reason => (
                                <div key={reason.area} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
                                    <span className="text-muted-foreground">{reason.area}</span>
                                    <div className="flex flex-col gap-1">
                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                            <div className="h-full rounded-full bg-foreground" style={{ width: `${reason.score}%` }} />
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {reason.why} · counts {reason.weight}%
                                        </span>
                                    </div>
                                    <span className="text-right tabular-nums">{reason.points}</span>
                                </div>
                            ))}
                    </div>
                </section>
            ) : null}

            <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <h2 className="font-heading text-xl font-semibold">Specifications</h2>
                    <p className="text-sm text-muted-foreground">
                        Each value shows its most reliable source and how many others agree: green for {NEED} or more independent sources, amber for two, grey for one, red where sources
                        disagree. Open a value for what each source says.
                    </p>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Spec</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead className="text-right">Sources</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groups.map(group => {
                            const specs = RUN.specs.filter(spec => spec.group === group && !spec.id.startsWith('image_'))
                            return [
                                <TableRow key={group}>
                                    <TableCell colSpan={3} className="pt-6 font-medium">
                                        {group}
                                    </TableCell>
                                </TableRow>,
                                ...specs.map(spec => <SpecRow key={spec.id} label={spec.label} tip={spec.tip} fact={facts[spec.id]} />),
                            ]
                        })}
                    </TableBody>
                </Table>
            </section>

            {detail?.sources?.length ? (
                <section className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-heading text-xl font-semibold">Sources</h2>
                        <p className="text-sm text-muted-foreground">Every page read for this camera, and when it was scraped.</p>
                    </div>
                    <Table>
                        <TableBody>
                            {detail.sources.map(source => (
                                <TableRow key={source.url}>
                                    <TableCell className="w-1/4">{source.title}</TableCell>
                                    <TableCell className="max-w-0 truncate">
                                        <a href={source.url} target="_blank" rel="noopener" className="underline">
                                            {source.url}
                                        </a>
                                    </TableCell>
                                    <TableCell className="w-1/6 text-right text-muted-foreground">{day(source.scrapedAt)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </section>
            ) : null}
        </article>
    )
}
