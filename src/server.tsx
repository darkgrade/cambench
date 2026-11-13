/** Renders each page to HTML at build time (scripts/prerender.ts), so every page is static and crawlable. */
import { loadViews, Overview } from '@site/app'
import { BENCH, type CameraDetail, cameraFromPath, TABS } from '@site/data'
import { cameraDetail } from '@site/details'
import { Entry } from '@site/entry'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'

export { routes, BENCH } from '@site/data'

// A view that loads on first use renders as a placeholder until its code has arrived. Rendering each once
// asks for that code; once it is here, the pages below come out whole.
for (const tab of TABS) renderToString(<Overview path={`${BENCH.path}${tab.id}/`} />)
await loadViews()
await new Promise(resolve => setTimeout(resolve, 0))

/** A camera page's data, which the build embeds in that page for the browser (null for other pages). */
export function pageData(path: string): CameraDetail | null {
    const camera = cameraFromPath(path)
    return camera ? (cameraDetail(camera.slug) ?? null) : null
}

export function render(path: string): string {
    const camera = cameraFromPath(path)
    return renderToString(<StrictMode>{camera ? <Entry camera={camera} detail={pageData(path) ?? undefined} /> : <Overview path={path} />}</StrictMode>)
}
