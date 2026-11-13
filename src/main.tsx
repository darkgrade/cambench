import { cameraFromPath } from '@site/data'
import '@site/styles.css'
import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

// A camera's page and the overview load separately, so neither carries the other's code or data.
const camera = cameraFromPath(location.pathname)
const page = camera ? await import('@site/entry').then(({ Entry }) => <Entry camera={camera} />) : await import('@site/app').then(({ Overview }) => <Overview path={location.pathname} />)

const root = document.getElementById('root')!
const app = <StrictMode>{page}</StrictMode>
// Built pages arrive prerendered and are hydrated; the dev server renders fresh.
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
