import { BENCH, TABS } from '@site/data'
import { Loading, Page, Shell, tabFromPath, useTab } from '@site/kit/shell'
import { CamerasView } from '@site/views/cameras'
import { MethodView } from '@site/views/method'
import { StoryView } from '@site/views/story'
import { type ComponentType, lazy, Suspense } from 'react'

/** A view's props: how it opens another view, optionally at a query (two cameras to compare). */
export interface ViewProps {
    onOpen: (tab: string, query?: string) => void
}

/** The views that load on first use, so the story never waits on their code. */
const LOADERS = {
    atlas: () => import('@site/views/atlas'),
    size: () => import('@site/views/size'),
    sources: () => import('@site/views/sources'),
    compare: () => import('@site/views/compare'),
}
const AtlasView = lazy<ComponentType<ViewProps>>(LOADERS.atlas)
const SizeView = lazy<ComponentType<ViewProps>>(LOADERS.size)
const SourcesView = lazy<ComponentType<ViewProps>>(LOADERS.sources)
const CompareView = lazy<ComponentType<ViewProps>>(LOADERS.compare)

/** Loads every view's code: the server render waits on this so each view's page is prerendered whole. */
export const loadViews = (): Promise<unknown> => Promise.all(Object.values(LOADERS).map(load => load()))

/** The overview: the story and the other views, each at its own path under BENCH.path. */
export function Overview({ path }: { path: string }) {
    const [tab, select] = useTab(BENCH, TABS, tabFromPath(BENCH, TABS, path) ?? TABS[0].id)
    return (
        <Shell bench={BENCH} tabs={TABS} tab={tab} onTab={select}>
            {tab === 'story' && <StoryView onOpen={select} />}
            {tab === 'cameras' && (
                <Page>
                    <CamerasView />
                </Page>
            )}
            {tab === 'method' && <MethodView />}
            <Suspense fallback={<Loading />}>
                {tab === 'spec-level' && <AtlasView onOpen={select} />}
                {tab === 'size' && <SizeView onOpen={select} />}
                {tab === 'sources' && <SourcesView onOpen={select} />}
                {tab === 'compare' && <CompareView onOpen={select} />}
            </Suspense>
        </Shell>
    )
}
