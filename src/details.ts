/** Every camera's page data, for the server render only (src/server.tsx): browsers get their page's alone. */
import type { CameraDetail } from '@site/data'

const details = import.meta.glob<CameraDetail>('../results/cameras/*.json', { eager: true, import: 'default' })

export function cameraDetail(slug: string): CameraDetail | undefined {
    return details[`../results/cameras/${slug}.json`]
}
