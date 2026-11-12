/** Renders each page to HTML at build time (scripts/prerender.ts), so every page is static and crawlable. */
import { App } from '@site/app'
import { BENCH, CAMERAS } from '@site/data'
import { cameraDetail } from '@site/details'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'

export { routes, BENCH } from '@site/data'

/** A camera page's data, which the build embeds in that page for the browser (null for other pages). */
export function pageData(path: string): unknown {
    const slug = path.replace(BENCH.path, '').replace(/\/$/, '')
    return CAMERAS.some(camera => camera.slug === slug) ? (cameraDetail(slug) ?? null) : null
}

export function render(path: string): string {
    const data = pageData(path) as Parameters<typeof App>[0]['detail']
    return renderToString(
        <StrictMode>
            <App path={path} detail={data ?? undefined} />
        </StrictMode>
    )
}
