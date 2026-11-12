import { Badge, Stat, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kevinschaich/components'
import { BENCH, CAMERAS, type CameraSummary, RUN, cameraDetail, picture, price } from '@site/data'

const STATUS: Record<string, { label: string; variant: 'secondary' | 'outline' }> = {
    verified: { label: 'Verified', variant: 'secondary' },
    quote: { label: 'Listed price', variant: 'outline' },
}

/** One camera: its pictures, spec level and why, and every spec with how many independent sources state it. */
export function CameraPage({ camera }: { camera: CameraSummary }) {
    const detail = cameraDetail(camera.slug)
    const rank = CAMERAS.indexOf(camera) + 1
    const groups = [...new Set(RUN.specs.map(spec => spec.group))]
    const facts = detail?.facts ?? {}
    const verified = Object.values(facts).filter(fact => fact.status === 'verified').length
    return (
        <article className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <a href={BENCH.path} className="text-sm text-muted-foreground hover:underline">
                    ← All cameras
                </a>
                <h1 className="font-heading text-3xl font-semibold tracking-tight">{camera.name}</h1>
                <span className="text-sm text-muted-foreground">{camera.brand}</span>
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat boxed size="lg" label="Spec level" value={camera.level ?? '–'} unit="/ 100" sub={`#${rank} of ${CAMERAS.length} cameras`} />
                <Stat boxed size="lg" label="Price" value={price(camera.price)} sub="new, body only" />
                <Stat boxed size="lg" label="Verified specs" value={verified} sub={`of ${Object.keys(facts).length}`} />
                <Stat boxed size="lg" label="Sensor" value={(camera.specs.sensor?.text ?? '–').split(' (')[0]} />
            </div>

            {detail?.level?.reasons?.length ? (
                <section className="flex flex-col gap-3">
                    <h2 className="font-heading text-xl font-semibold">How the spec level adds up</h2>
                    <div className="flex flex-col gap-2">
                        {detail.level.reasons.map(reason => (
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

            {groups.map(group => {
                const specs = RUN.specs.filter(spec => spec.group === group && facts[spec.id])
                if (!specs.length) return null
                return (
                    <section key={group} className="flex flex-col gap-3">
                        <h2 className="font-heading text-xl font-semibold">{group}</h2>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-1/3">Spec</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead className="text-right">Sources</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {specs.map(spec => {
                                    const fact = facts[spec.id]
                                    const status = STATUS[fact.status]
                                    return (
                                        <TableRow key={spec.id}>
                                            <TableCell className="text-muted-foreground" title={spec.tip}>
                                                {spec.label}
                                            </TableCell>
                                            <TableCell>
                                                <span className="flex flex-wrap items-center gap-2">
                                                    {fact.text ?? '–'}
                                                    {status && <Badge variant={status.variant}>{status.label}</Badge>}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums" title={fact.owners.join(', ')}>
                                                {fact.sources}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </section>
                )
            })}
        </article>
    )
}
