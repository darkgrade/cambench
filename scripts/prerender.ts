/**
 * Writes one static HTML page per route (the overview and each camera) with its own title,
 * description, canonical URL and preview card, and draws each card as a 1200×630 PNG with the shared
 * Darkgrade card. Runs after `vite build` and the server build; static output only.
 */
import { Resvg } from '@resvg/resvg-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import satori from 'satori'
import sharp from 'sharp'
import { createElement } from 'react'
import { OgCard, backdropDataURI, darkgradeMark } from '@kevinschaich/components/og'

interface Route {
    path: string
    title: string
    description: string
    card: { heading: string; sub: string; image?: string }
}

const root = resolve(import.meta.dirname, '..')
const server = (await import(join(root, '.server', 'server.js'))) as {
    render: (path: string) => string
    pageData: (path: string) => unknown
    routes: () => Route[]
    BENCH: { name: string; tagline: string; repository: string; path: string; origin: string; subject: string }
}
const output = join(root, 'dist', server.BENCH.path)
const template = readFileSync(join(output, 'index.html'), 'utf8')
const fonts = createRequire(import.meta.url)
const font = (pkg: string, file: string) => readFileSync(fonts.resolve(`@fontsource/${pkg}/files/${file}.woff`))
const sans = (weight: number) => font('public-sans', `public-sans-latin-${weight}-normal`)
const FONTS = [
    { name: 'body', data: sans(400), weight: 400 as const, style: 'normal' as const },
    { name: 'heading', data: sans(600), weight: 600 as const, style: 'normal' as const },
    { name: 'heading', data: sans(500), weight: 500 as const, style: 'normal' as const },
    { name: 'mono', data: font('fragment-mono', 'fragment-mono-latin-400-normal'), weight: 400 as const, style: 'normal' as const },
]

// A page's own data for the browser (a camera's specs and evidence), as JSON it can read without a request.
const embedded = (data: unknown): string => (data ? `<script id="camera-data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '')

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The card's background: Darkgrade's dust, and for a camera its own picture (a transparent cutout from
 * public/cameras) on the right, clear of the words. satori and resvg can't read webp, so sharp composes a PNG.
 */
async function background(route: Route): Promise<string> {
    const backdrop = await backdropDataURI()
    const file = route.card.image && join(root, 'public', route.card.image)
    if (!file || !existsSync(file)) return backdrop
    const camera = await sharp(file).resize(520, 440, { fit: 'inside' }).png().toBuffer()
    const { width = 0, height = 0 } = await sharp(camera).metadata()
    const base = Buffer.from(backdrop.slice(backdrop.indexOf(',') + 1), 'base64')
    const png = await sharp(base).resize(1200, 630, { fit: 'cover' }).composite([{ input: camera, left: 930 - Math.round(width / 2), top: 315 - Math.round(height / 2) }]).png().toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
}

/** The preview card: the shared Darkgrade card. */
async function card(route: Route): Promise<Buffer> {
    const element = createElement(OgCard, {
        logo: { mark: darkgradeMark.dark, name: 'Darkgrade' },
        main: route.card.heading,
        sub: route.card.sub,
        address: `darkgrade.com${server.BENCH.path.replace(/\/$/, '')}${route.path ? `/${route.path.replace(/\/$/, '')}` : ''}`,
        background: await background(route),
    })
    const svg = await satori(element, { width: 1200, height: 630, fonts: FONTS })
    return Buffer.from(new Resvg(svg).render().asPng())
}

const DARKGRADE = { '@type': 'Organization', name: 'Darkgrade', url: 'https://darkgrade.com/' }
const home = `${server.BENCH.origin}${server.BENCH.path}`

/** Schema.org data: the bench is a Dataset by Darkgrade with its code on GitHub; each other page is part of it. */
function structuredData(route: Route, url: string): string {
    const dataset = {
        '@type': 'Dataset',
        '@id': `${home}#dataset`,
        name: `${server.BENCH.name} by Darkgrade`,
        alternateName: server.BENCH.subject,
        description: server.BENCH.tagline,
        url: home,
        creator: DARKGRADE,
        publisher: DARKGRADE,
        isAccessibleForFree: true,
        sameAs: `https://github.com/${server.BENCH.repository}`,
    }
    if (!route.path) return JSON.stringify({ '@context': 'https://schema.org', ...dataset })
    return JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: route.title, description: route.description, url, isPartOf: dataset, publisher: DARKGRADE })
}

const pages: string[] = []
for (const route of server.routes()) {
    const url = `${server.BENCH.origin}${server.BENCH.path}${route.path}`
    const image = `${server.BENCH.origin}${server.BENCH.path}og/${route.path ? route.path.replace(/\/$/, '') : 'index'}.png`
    const head = [
        `<title>${escape(route.title)}</title>`,
        `<meta name="description" content="${escape(route.description)}" />`,
        `<link rel="canonical" href="${url}" />`,
        `<meta property="og:title" content="${escape(route.title)}" />`,
        `<meta property="og:description" content="${escape(route.description)}" />`,
        `<meta property="og:image" content="${image}" />`,
        `<meta property="og:url" content="${url}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<script type="application/ld+json">${structuredData(route, url).replace(/</g, '\\u003c')}</script>`,
    ].join('\n        ')
    // Replacements are functions so that a "$&" in a page's own text (a quoted price) is not read as a pattern.
    const body = `<div id="root">${server.render(`${server.BENCH.path}${route.path}`)}</div>${embedded(server.pageData(`${server.BENCH.path}${route.path}`))}`
    const html = template.replace(/<title>[\s\S]*?<meta name="twitter:card"[^>]*>/, () => head).replace('<div id="root"></div>', () => body)
    const file = join(output, route.path, 'index.html')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, html)
    pages.push(url)
    const cardFile = join(output, 'og', `${route.path ? route.path.replace(/\/$/, '') : 'index'}.png`)
    mkdirSync(dirname(cardFile), { recursive: true })
    writeFileSync(cardFile, await card(route))
}
writeFileSync(join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `  <url><loc>${escape(page)}</loc></url>`).join('\n')}\n</urlset>\n`)
console.log(`prerendered ${server.routes().length} pages`)
