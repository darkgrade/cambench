import { Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Leaderboard, type LeaderboardColumn, Tabs, TabsContent, TabsList, TabsTrigger } from '@kevinschaich/components'
import { BENCH, CAMERAS, type CameraSummary, FILTERS, NEWEST, TABS, picture, price, specText, year } from '@site/data'
import { LevelChart } from '@site/pages/level-chart'
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

/** A camera as the app's grid shows it: its picture, name, brand, year and price, and its spec level as a bar. */
function CameraCard({ camera }: { camera: CameraSummary }) {
    return (
        <a href={`${BENCH.path}${camera.slug}/`} className="group flex flex-col gap-3 rounded-lg bg-muted/40 p-3.5 transition-colors hover:bg-muted">
            <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md">
                {camera.image.front ? (
                    <img src={picture(camera.image.front)} alt={camera.name} loading="lazy" className="size-full object-contain transition-transform group-hover:scale-[1.03]" />
                ) : (
                    <span className="text-xs text-muted-foreground">No image yet</span>
                )}
            </span>
            <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{camera.name}</span>
                <span className="text-sm text-muted-foreground">{[camera.brand, year(camera), camera.price !== null ? price(camera.price) : null].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Spec level
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-foreground" style={{ width: `${camera.level ?? 0}%` }} />
                </span>
                <b className="w-6 text-right text-sm text-foreground tabular-nums">{camera.level ?? '–'}</b>
            </span>
        </a>
    )
}

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
    const newest = NEWEST.filter(camera => FILTERS.every(filter => filter.options.find(option => option.id === chosen[filter.id])!.matches(camera)))
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
                        <Card>
                            <CardHeader>
                                <CardTitle>Newest cameras</CardTitle>
                                <CardDescription>Every value read from the makers, retailers and reviews, and checked across independent sources. Open a camera for its sources.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {newest.map(camera => (
                                    <CameraCard key={camera.id} camera={camera} />
                                ))}
                            </CardContent>
                        </Card>
                        <h2 className="mt-4 font-heading text-xl font-semibold">Every camera</h2>
                        <Leaderboard rows={shown} rowKey={camera => camera.id} defaultSort="level" columns={COLUMNS} />
                    </>
                )}
            </TabsContent>
            <TabsContent value="spec-level" className="flex flex-col gap-3">
                <Filters chosen={chosen} choose={choose} />
                <Card>
                    <CardHeader>
                        <CardTitle>Spec level</CardTitle>
                        <CardDescription>
                            Spec level scores video, resolution, burst, viewfinder, stabilization, card slots, build and battery, autofocus and screen on fixed scales, weighted by how much each
                            matters (video most). Price is today's new price where known, else the launch MSRP.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LevelChart cameras={shown} />
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="method">
                <Method />
            </TabsContent>
        </Tabs>
    )
}
