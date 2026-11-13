/**
 * Each camera's body: its agreed dimensions and weight (only values two or more independent sources
 * agree on), and the shape of its front picture once cut down to the body. scripts/build-data.ts
 * writes src/bodies.json from the published results.
 */
import bodies from '@site/bodies.json'
import type { CameraSummary } from '@site/data'

export interface Body {
    /** Millimetres. */
    width?: number
    height?: number
    depth?: number
    /** Grams, with battery and card. */
    weight?: number
    /** The front picture's width over its height. */
    aspect?: number
}

export const BODIES = bodies as Record<string, Body>

export interface Sensor {
    format: string
    /** Millimetres. */
    width: number
    height: number
}

/** A camera's sensor, when its dimensions are known. */
export function sensorOf(camera: CameraSummary): Sensor | undefined {
    const sensor = camera.specs.sensor?.value as { format?: string; w?: number; h?: number } | undefined
    return sensor?.w && sensor.h ? { format: sensor.format ?? '', width: sensor.w, height: sensor.h } : undefined
}

/** One decimal at most, without a trailing ".0". */
export const millimetres = (value: number): string => String(Math.round(value * 10) / 10)
