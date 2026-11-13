/**
 * The story of the readings: every thing a website says about a camera as a point of light, rearranged
 * as you scroll from the cameras, through who says what and where they differ, to what makes a value
 * verified. Ends with every camera, best spec level first.
 */
import type { ViewProps } from '@site/app'
import { BENCH, CAMERAS, RUN, price, year } from '@site/data'
import facts from '@site/facts.json'
import { type Scene, type Space, Story, type Step } from '@site/kit/story'
import { TYPE } from '@site/kit/theme'
import { type Quotes, type Readings, STANDING, STANDINGS, cameraOf, share, specOf, useData, useReadings } from '@site/readings'
import { type Layouts, PALETTE, makeLayouts } from '@site/views/story/layouts'
import { type ReactNode, useMemo } from 'react'

const NEED = RUN.need ?? 3
const SPEC_LABELS = new Map(RUN.specs.map(spec => [spec.id, spec.label.replace(/ \(.*\)$/, '').toLowerCase()]))
/** Specs whose value is one figure or choice, so two sites can plainly differ (lists are merged instead). */
const PLAIN_KINDS = new Set(['enum', 'bool', 'number', 'sensor', 'dims', 'date', 'shutter', 'text'])

/** The main sources, by how often what they state matches a value enough independent sources agree on. */
const CHECKED = facts.groups.filter(group => group.checked > 300).sort((first, second) => second.matched / second.checked - first.matched / first.checked)
/** Specs by the share of their readings that differ from the agreed value, most first. */
const BY_DIFFERENCE = facts.specs.filter(spec => spec.readings > 100).sort((first, second) => second.differ / second.readings - first.differ / first.readings)
const SETTLED = facts.specs
    .filter(spec => spec.differ === 0 && PLAIN_KINDS.has(RUN.specs.find(item => item.id === spec.id)?.kind ?? ''))
    .sort((first, second) => second.readings - first.readings)

const specName = (id: string): string => SPEC_LABELS.get(id) ?? id
const differing = (spec: { readings: number; differ: number }): string => share(spec.differ, spec.readings)

function Key() {
    return (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {STANDINGS.map(item => (
                <span key={item.id} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: item.color }} />
                    {item.short}
                </span>
            ))}
        </p>
    )
}

function steps(layouts: Layouts | undefined): Step[] {
    const picture = (draw: (made: Layouts) => (space: Space) => Scene) => (space: Space) => draw(layouts!)(space)
    const best = CAMERAS[0]
    const most = CHECKED[0]
    const least = CHECKED[CHECKED.length - 1]
    const [first, second, third] = BY_DIFFERENCE
    return [
        {
            id: 'cameras',
            kicker: 'Cambench',
            title: 'What does the web say about a camera?',
            body: (
                <>
                    <p>
                        Before you buy a camera you read its specs: on the maker's site, at a shop, in a review. They don't always say the same thing. So we read {CAMERAS.length} cameras
                        everywhere we could find them, and kept every claim with the words it came from.
                    </p>
                    <p>Every point of light is one thing one website says about one camera. Each cluster is a camera, gathered by maker. Scroll to see where the web agrees.</p>
                </>
            ),
            extra: <Key />,
            scene: picture(made => made.constellations),
        },
        {
            id: 'sources',
            kicker: 'Who says it',
            title: 'The maker is one voice among many',
            body: (
                <>
                    <p>The same points, lined up by who said them. Makers and B&H publish the fullest spec sheets. Reviews, Wikipedia and other shops repeat most of it, and that repetition is what lets us check.</p>
                    <p>
                        Red marks a reading that differs from what the others agree on. Every source has some. Checked against values that {NEED} or more independent sources agree on,{' '}
                        {most.label === 'The maker' ? 'the makers match' : `${most.label} matches`} {share(most.matched, most.checked)} of the time and {least.label} {share(least.matched, least.checked)}.
                    </p>
                </>
            ),
            scene: picture(made => made.bySource),
        },
        {
            id: 'specs',
            kicker: 'What they say',
            title: 'Some specs are facts. Others depend on who is counting.',
            body: (
                <>
                    <p>
                        Now each row is a spec. Nobody differs about a camera's {specName(SETTLED[0].id)} or {specName(SETTLED[1].id)}.
                    </p>
                    <p>
                        But {differing(first)} of what sites say about {specName(first.id)} differs from the agreed value, as does {differing(second)} for {specName(second.id)} and {differing(third)}{' '}
                        for {specName(third.id)}. Often both figures are real: a battery lasts longer on the rear screen than through the viewfinder, and a site quotes one or the other.
                    </p>
                </>
            ),
            scene: picture(made => made.bySpec),
        },
        {
            id: 'contested',
            kicker: 'Where they differ',
            title: `1 value in ${Math.round(facts.values.total / facts.values.contested)} has a site that says otherwise`,
            body: (
                <>
                    <p>Everything that agrees fades away. What is left gathers by spec: the bigger the cluster, the more often sites differ about it.</p>
                    <p>
                        Most of these are settled all the same: when one site differs and several agree, the several win. Only {facts.values.disputed} values have no agreement at all. Those are
                        the purple ones.
                    </p>
                </>
            ),
            scene: picture(made => made.contested),
        },
        {
            id: 'verified',
            kicker: 'Verified',
            title: `Verified means ${NEED} independent sources agree`,
            body: (
                <>
                    <p>
                        Each column is how many independent sources state the same value. Two sites owned by one company count once. One source is a claim, two make it likely, {NEED} or more
                        make it verified.
                    </p>
                    <p>
                        {share(facts.values.verified, facts.values.total)} of all values clear that bar, most with room to spare. Prices are different: they change by the day, so each is shown
                        as listed, with its date.
                    </p>
                </>
            ),
            scene: picture(made => made.support),
        },
        {
            id: 'field',
            kicker: 'The cameras',
            title: 'Newer is not always more camera',
            body: (
                <>
                    <p>
                        Each camera's readings gather back into one light. Further right is newer. Higher is a higher spec level: a score from 0 to 100 on fixed scales for video, resolution,
                        burst, viewfinder and the rest, whatever the camera costs.
                    </p>
                    <p>
                        {best.name} leads at {best.level}. Every camera is listed below, best first.
                    </p>
                </>
            ),
            scene: picture(made => made.timeline),
        },
    ]
}

/** What a point is: the camera, the spec, who said it, the words it was read from and how it stands. */
function ReadingTip({ readings, index }: { readings: Readings; index: number }) {
    const camera = cameraOf(readings.cameras[readings.camera[index]])
    const spec = specOf(readings.specs[readings.spec[index]])
    const standing = STANDINGS[readings.standing[index]]
    const loaded = useData<Quotes>(`quotes/${camera.slug}.json`)
    const quotes = loaded instanceof Error ? undefined : loaded
    // A camera's quotes are in the order of its readings, which sit together in the columns.
    const quote = quotes?.quotes[index - readings.camera.indexOf(readings.camera[index])]?.[0]
    const agreed = quotes?.values[spec.id]
    const showsAgreed = readings.standing[index] === STANDING.differs && agreed
    return (
        <>
            <p className="font-heading text-sm leading-snug font-semibold">{camera.name}</p>
            <p className="text-xs text-muted-foreground">
                {spec.label} · {readings.owners[readings.owner[index]]}
            </p>
            {quote && <p className="line-clamp-3 text-xs leading-relaxed text-foreground/80">“{quote}”</p>}
            <p className="text-xs font-medium" style={{ color: standing.color }}>
                {standing.label}
                {showsAgreed ? `: ${agreed}` : ''}
            </p>
        </>
    )
}

export function StoryView({ onOpen }: ViewProps) {
    const loaded = useReadings()
    const readings = loaded instanceof Error ? undefined : loaded
    const layouts = useMemo(() => (readings ? makeLayouts(readings) : undefined), [readings])
    const story = useMemo(() => steps(layouts), [layouts])

    const tip = (index: number): ReactNode => (readings ? <ReadingTip readings={readings} index={index} /> : null)

    function open(index: number): void {
        if (readings) location.assign(`${BENCH.path}${readings.cameras[readings.camera[index]]}/`)
    }

    return (
        <Story count={layouts?.count ?? 0} palette={PALETTE} steps={story} tip={tip} onSelect={open}>
            <Ranking onOpen={onOpen} />
        </Story>
    )
}

/** Every camera, best first, as plain links: the end of the story and the way in to each camera's own page. */
function Ranking({ onOpen }: ViewProps) {
    return (
        <section className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-4 pb-16 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className={TYPE.label}>Every camera</p>
                    <h2 className={TYPE.title}>By spec level, best first</h2>
                </div>
                <div className="flex gap-4 text-sm">
                    <a
                        href={`${BENCH.path}spec-level/`}
                        onClick={event => {
                            event.preventDefault()
                            onOpen('spec-level')
                        }}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                        Place them on your own axes →
                    </a>
                </div>
            </div>
            <ol className="grid gap-x-10 sm:grid-cols-2">
                {CAMERAS.map((camera, index) => (
                    <li key={camera.id} className="border-b border-white/5">
                        <a href={`${BENCH.path}${camera.slug}/`} className="group grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 py-2.5">
                            <span className={`${TYPE.number} text-xs text-muted-foreground`}>{index + 1}</span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium group-hover:underline">{camera.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">{[year(camera), camera.specs.sensor?.text?.split(' (')[0], camera.specs.mp?.text, price(camera.price)].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="hidden h-1 w-20 overflow-hidden rounded-full bg-white/10 sm:block">
                                    <span className="block h-full rounded-full bg-foreground" style={{ width: `${camera.level ?? 0}%` }} />
                                </span>
                                <span className={`${TYPE.number} w-7 text-right text-sm font-semibold`}>{camera.level ?? '–'}</span>
                            </span>
                        </a>
                    </li>
                ))}
            </ol>
        </section>
    )
}
