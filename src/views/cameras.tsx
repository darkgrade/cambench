/** Every camera as a grid, newest first, and as a sortable table, with the filters: the plain view of the results. */
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, Leaderboard, type LeaderboardColumn, Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import { BENCH, CAMERAS, type CameraSummary, FILTERS, NEWEST, price, specText, year } from '@site/data'
import { TYPE } from '@site/kit/theme'
import { smallPicture } from '@site/readings'
import { useState } from 'react'

const COLUMNS: LeaderboardColumn<CameraSummary>[] = [
    {
        key: 'camera',
        label: 'Camera',
        render: camera => (
            <a href={`${BENCH.path}${camera.slug}/`} className="flex items-center gap-3 hover:underline">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted p-1">
                    {camera.image.front && <img src={smallPicture(camera)} alt="" loading="lazy" className="size-full object-contain" />}
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

/** A camera as the grid shows it: its picture, name, brand, year and price, and its spec level as a bar. */
function CameraCard({ camera }: { camera: CameraSummary }) {
    return (
        <a href={`${BENCH.path}${camera.slug}/`} className="group flex flex-col gap-3 rounded-lg bg-muted/40 p-3.5 transition-colors hover:bg-muted">
            <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md p-3">
                {camera.image.front ? (
                    <img src={smallPicture(camera, true)} alt={camera.name} loading="lazy" className="size-full object-contain transition-transform group-hover:scale-[1.03]" />
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

/** One row of filters per category, each a one-of-a-few choice. */
function Filters({ chosen, choose }: { chosen: Record<string, string>; choose: (filter: string, option: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {FILTERS.map(filter => (
                <div key={filter.id} className="max-w-full overflow-x-auto [scrollbar-width:none]">
                    <Tabs value={chosen[filter.id]} onValueChange={value => choose(filter.id, String(value))}>
                        <TabsList aria-label={filter.label}>
                            {filter.options.map(option => (
                                <TabsTrigger key={option.id} value={option.id}>
                                    {option.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            ))}
        </div>
    )
}

export function CamerasView() {
    const [chosen, setChosen] = useState<Record<string, string>>(Object.fromEntries(FILTERS.map(filter => [filter.id, 'all'])))
    const matches = (camera: CameraSummary): boolean => FILTERS.every(filter => filter.options.find(option => option.id === chosen[filter.id])!.matches(camera))
    const choose = (filter: string, option: string) => setChosen(previous => ({ ...previous, [filter]: option }))
    if (CAMERAS.length === 0)
        return (
            <Empty className="border">
                <EmptyHeader>
                    <EmptyTitle>Cameras are on the way</EmptyTitle>
                    <EmptyDescription>Their specs are being verified now. Check back soon.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className={TYPE.title}>Every camera</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Every value is read from the makers, shops and reviews, and checked across independent sources. Open a camera for what each source says.</p>
            </div>
            <Filters chosen={chosen} choose={choose} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {NEWEST.filter(matches).map(camera => (
                    <CameraCard key={camera.id} camera={camera} />
                ))}
            </div>
            <h2 className={`${TYPE.heading} mt-4`}>As a table</h2>
            <Leaderboard rows={CAMERAS.filter(matches)} rowKey={camera => camera.id} defaultSort="level" columns={COLUMNS} />
        </div>
    )
}
