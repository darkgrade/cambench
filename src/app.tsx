import { BENCH, CAMERAS, type CameraDetail, TABS, embeddedDetail } from '@site/data'
import { CameraPage } from '@site/pages/camera'
import { Overview, tabFromPath } from '@site/pages/overview'

/** The page for a path under BENCH.path: an overview tab, or one camera's page. */
export function App({ path, detail }: { path: string; detail?: CameraDetail }) {
    const id = path.replace(BENCH.path, '').replace(/\/$/, '')
    const tab = tabFromPath(path)
    const camera = tab ? undefined : id ? CAMERAS.find(candidate => candidate.slug === id) : undefined
    return (
        <div className="mx-auto flex min-h-svh max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <a href={BENCH.path} className="font-heading text-2xl font-semibold tracking-tight hover:underline">
                        {BENCH.name}
                    </a>
                    <p className="text-sm text-muted-foreground">{BENCH.tagline}</p>
                </div>
                <span className="ks-byline">
                    <a href="https://darkgrade.com/">By Darkgrade</a>
                    {' · '}
                    <a href={`https://github.com/${BENCH.repository}`} target="_blank" rel="noopener">
                        code on github
                    </a>
                </span>
            </header>
            {camera ? <CameraPage camera={camera} detail={detail ?? embeddedDetail()} /> : <Overview initialTab={tab ?? TABS[0].id} />}
        </div>
    )
}
