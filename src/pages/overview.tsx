import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, Leaderboard, type LeaderboardColumn, Tabs, TabsContent, TabsList, TabsTrigger, TradeoffChart } from '@kevinschaich/components'
import { BENCH, CAMERAS, type CameraSummary, FILTERS, TABS, picture, price, specText } from '@site/data'
import { Method } from '@site/pages/method'
import { useEffect, useState } from 'react'

const COLUMNS: LeaderboardColumn<CameraSummary>[] = [
    {
        key: 'camera',
        label: 'Camera',
        render: camera => (
            <a href={`${BENCH.path}${camera.slug}/`} className="flex items-center gap-3 hover:underline">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {camera.image.front && <img src={picture(camera.image.front)} alt="" loading="lazy" className="size-full object-contain" />}
                </span>
                <span className="flex flex-col">
                    <span className="font-medium text-foreground">{camera.name}</span>
                    <span className="text-xs text-muted-foreground">{camera.brand}</span>
                </span>
            </a>
        ),
    },
    { key: 'level', label: 'Spec level', hint: 'out of 100', better: 'higher', value: camera => camera.level, render: camera => <span className="font-semibold">{camera.level ?? '–'}</span> },
    { key: 'price', label: 'Price', hint: 'new, body only', value: camera => camera.price, render: camera => price(camera.price) },
    { key: 'sensor', label: 'Sensor', render: camera => specText(camera, 'sensor').split(' (')[0] },
    { key: 'mp', label: 'Resolution', better: 'higher', value: camera => (typeof camera.specs.mp?.value === 'number' ? camera.specs.mp.value : null), render: camera => specText(camera, 'mp') },
    { key: 'burst', label: 'Burst', render: camera => specText(camera, 'burst') },
    { key: 'announced', label: 'Announced', render: camera => specText(camera, 'announced') },
]

/** The tab a path under BENCH.path names; the first tab is the bench's root. */
export function tabFromPath(path: string): string | undefined {
    const id = path.replace(BENCH.path, '').replace(/\/$/, '')
    if (!id) return TABS[0].id
    return TABS.some(tab => tab.id === id) ? id : undefined
}

const tabPath = (id: string): string => (id === TABS[0].id ? BENCH.path : `${BENCH.path}${id}/`)

/** One row of filters per category, each a one-of-a-few choice. */
function Filters({ chosen, choose }: { chosen: Record<string, string>; choose: (filter: string, option: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {FILTERS.map(filter => (
                <Tabs key={filter.id} value={chosen[filter.id]} onValueChange={value => choose(filter.id, String(value))}>
                    <TabsList aria-label={filter.label}>
                        {filter.options.map(option => (
                            <TabsTrigger key={option.id} value={option.id}>
                                {option.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            ))}
        </div>
    )
}

export function Overview({ initialTab }: { initialTab: string }) {
    const [tab, setTab] = useState(initialTab)
    const [chosen, setChosen] = useState<Record<string, string>>(Object.fromEntries(FILTERS.map(filter => [filter.id, 'all'])))
    const shown = CAMERAS.filter(camera => FILTERS.every(filter => filter.options.find(option => option.id === chosen[filter.id])!.matches(camera)))
    const choose = (filter: string, option: string) => setChosen(previous => ({ ...previous, [filter]: option }))
    useEffect(() => {
        const onPop = () => setTab(tabFromPath(location.pathname) ?? TABS[0].id)
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])
    const select = (id: string) => {
        setTab(id)
        history.pushState(null, '', tabPath(id))
    }

    return (
        <Tabs value={tab} onValueChange={value => select(String(value))} className="flex flex-col gap-6">
            <TabsList>
                {TABS.map(item => (
                    <TabsTrigger key={item.id} value={item.id}>
                        {item.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            <TabsContent value="cameras" className="flex flex-col gap-3">
                {CAMERAS.length === 0 ? (
                    <Empty className="border">
                        <EmptyHeader>
                            <EmptyTitle>Cameras are on the way</EmptyTitle>
                            <EmptyDescription>Their specs are being verified now. Check back soon.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <>
                        <Filters chosen={chosen} choose={choose} />
                        <Leaderboard rows={shown} rowKey={camera => camera.id} defaultSort="level" columns={COLUMNS} />
                        <p className="text-sm text-muted-foreground">
                            {CAMERAS.length} camera bodies, newest first on B&H. The spec level, out of 100, scores what a camera can do on fixed scales, whatever it costs. Pick a camera for every spec and who agrees on it.
                        </p>
                    </>
                )}
            </TabsContent>
            <TabsContent value="value" className="flex flex-col gap-3">
                <Filters chosen={chosen} choose={choose} />
                <TradeoffChart
                    points={shown.filter(camera => camera.price && camera.level !== null).map(camera => ({ id: camera.slug, label: camera.name, x: camera.price!, y: 100 - camera.level! }))}
                    xLabel="Price"
                    yLabel="Spec level"
                    xScale="log"
                    formatX={value => price(value)}
                    formatY={value => String(Math.round(100 - value))}
                    onSelect={id => location.assign(`${BENCH.path}${id}/`)}
                />
                <p className="text-sm text-muted-foreground">Toward the bottom left is more camera for the money: a higher spec level at a lower price.</p>
            </TabsContent>
            <TabsContent value="method">
                <Method />
            </TabsContent>
        </Tabs>
    )
}
