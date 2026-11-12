# Cambench

A database of camera specs verified across independent sources, published at darkgrade.com/cambench. Read
README.md first.

- `outpost/` is the Outpost app (it was Camera Atlas). Its workflow (`outpost/workflow.ts`) runs inside the
  app's own container in Outpost, where its database (`camera-atlas.db`), saved pages and pictures live. Never
  commit those: only `results/cambench.json`, `results/cameras/*.json` and `public/cameras/*.webp`, which the
  workflow's publish step writes.
- `src/` is the static site (Vite, React, `@kevinschaich/components`), prerendered by `scripts/prerender.ts`:
  the overview reads `results/cambench.json`, each camera's page its own `results/cameras/<slug>.json`.
- Sources ruled out for unreliable data: Digicamdb, Camera Decision, Versus, DXOMARK, PXLMAG (Kevin, 2026-11-05).
- A page fetched in the last 30 days is never fetched again; its saved Markdown is reused.
