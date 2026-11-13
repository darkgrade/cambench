/**
 * Every reading, as the overview's views load it: one thing one website says about one camera
 * (scripts/build-data.ts writes public/data/ from the published results). The readings load once, on
 * first use, in the browser; a camera's quoted words load when one of its readings is pointed at.
 */
import { BENCH, CAMERAS, type CameraSummary, RUN, type Spec } from '@site/data'
import { TONE } from '@site/kit/theme'
import { useEffect, useState } from 'react'

/** How a reading stands against what the other sources say. The order is the story's palette. */
export const STANDINGS = [
    { id: 'verified', label: 'Matches a verified value', short: 'Verified', color: TONE.good },
    { id: 'likely', label: 'One of two that agree', short: 'Two agree', color: TONE.fair },
    { id: 'single', label: 'The only source', short: 'One source', color: 'oklch(0.74 0.015 285)' },
    { id: 'differs', label: 'Differs from the agreed value', short: 'Differs', color: TONE.bad },
    { id: 'unsettled', label: 'No agreement yet', short: 'Unsettled', color: TONE.worst },
    { id: 'price', label: 'A price, as listed', short: 'Price', color: 'oklch(0.78 0.11 170)' },
] as const

export const STANDING = { verified: 0, likely: 1, single: 2, differs: 3, unsettled: 4, price: 5 } as const

/** A camera spec's own standing, as the results record it, with the color the story gives it. */
export const STATUS: Record<string, { label: string; color: string }> = {
    verified: { label: 'Verified', color: STANDINGS[STANDING.verified].color },
    likely: { label: 'Two sources agree', color: STANDINGS[STANDING.likely].color },
    single: { label: 'One source', color: STANDINGS[STANDING.single].color },
    disputed: { label: 'Sources disagree', color: STANDINGS[STANDING.unsettled].color },
    quote: { label: 'A listed price', color: STANDINGS[STANDING.price].color },
}

export interface SourceGroup {
    id: string
    label: string
}

/** Every reading in columns: entry `index` of each array is one reading. */
export interface Readings {
    /** Camera slugs, best spec level first. */
    cameras: string[]
    /** Spec ids, in the dictionary's order. */
    specs: string[]
    groups: SourceGroup[]
    /** Who is behind each reading: a company or a site. */
    owners: string[]
    camera: number[]
    spec: number[]
    group: number[]
    owner: number[]
    /** Index into STANDINGS. */
    standing: number[]
    /** How many independent sources state the listed value of the spec this reading is about. */
    support: number[]
}

/** One camera's quoted words, in the order of its readings. */
export interface Quotes {
    /** The listed value of each spec, by spec id. */
    values: Record<string, string>
    urls: string[]
    /** Per reading: the words quoted from the page, and the page (index into urls). */
    quotes: [string, number][]
}

async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${BENCH.path}data/${path}`)
    if (!response.ok) throw new Error(`${path}: ${response.status}`)
    return response.json() as Promise<T>
}

const loads = new Map<string, Promise<unknown>>()

/** A file under public/data, fetched once however many views ask for it. */
export function loadData<T>(path: string): Promise<T> {
    if (!loads.has(path)) loads.set(path, fetchJson<T>(path))
    return loads.get(path) as Promise<T>
}

/** A data file once it has loaded; undefined until then (or with no path), an Error if it couldn't be. */
export function useData<T>(path: string | undefined): T | Error | undefined {
    const [state, setState] = useState<{ path: string; value: T | Error }>()
    useEffect(() => {
        if (!path) return
        let current = true
        loadData<T>(path).then(
            value => current && setState({ path, value }),
            error => current && setState({ path, value: error instanceof Error ? error : new Error(String(error)) })
        )
        return () => {
            current = false
        }
    }, [path])
    return state && state.path === path ? state.value : undefined
}

export const useReadings = (): Readings | Error | undefined => useData<Readings>('readings.json')

const BY_SLUG = new Map(CAMERAS.map(camera => [camera.slug, camera]))
const SPEC_BY_ID = new Map(RUN.specs.map(spec => [spec.id, spec]))

/** The summary row for a slug; the data lists only cameras that have one. */
export const cameraOf = (slug: string): CameraSummary => BY_SLUG.get(slug)!
export const specOf = (id: string): Spec => SPEC_BY_ID.get(id)!

/** A camera's name without its maker, for tight places. */
export const shortName = (camera: CameraSummary): string => camera.name.replace(`${camera.brand} `, '').replace(/^(EOS|Lumix|LUMIX|Alpha) /, '')

/** A camera's small front picture, cut down to the body: about 170 px wide, or about 420 px (`large`). */
export const smallPicture = (camera: CameraSummary, large = false): string | undefined => (camera.image.front ? `${BENCH.path}data/${large ? 'bodies' : 'thumbs'}/${camera.slug}.webp` : undefined)

/** A share as a percent that keeps one decimal when it is small or close to all. */
export function share(part: number, whole: number): string {
    if (!whole) return '–'
    const value = (part / whole) * 100
    return `${value < 10 || value > 90 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)}%`
}
