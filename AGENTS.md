# Cambench

A database of camera specs verified across independent sources, published at darkgrade.com/cambench. Read
README.md first.

- `outpost/` is the Outpost app (it was Camera Atlas). Its workflow (`outpost/workflow.ts`) runs inside the
  app's own container in Outpost, where its database (`camera-atlas.db`), saved pages and pictures live. Never
  commit those: only `results/cambench.json`, `results/cameras/*.json` and `public/cameras/*.webp`, which the
  workflow's publish step writes. The app's page shows only the workflow's runs and what starts them (the kinds
  of run, the corpus, the reader and picture-review agents): the results are shown on the site, never there.
- `src/` is the static site (Vite, React, `@kevinschaich/components`), prerendered by `scripts/prerender.ts`.
  `scripts/build-data.ts` runs first (`bun run data`, and before `dev` and `build`): it turns `results/` into
  what the views load (`public/data/`: every reading in columns, each camera's quotes, the disagreements, small
  pictures cut down to the body) and three small tallies they bundle (`src/facts.json`, `src/agreement.json`,
  `src/bodies.json`). None of that is committed. Every number a caption quotes comes from those files.
- The overview (`src/app.tsx`) is the Story and the other views (`src/views/`), each at its own path; a camera's
  own page (`src/entry.tsx`, `src/pages/camera.tsx`) loads separately and reads its detail embedded in the page.
  Camera page addresses, titles and descriptions are indexed: change the page, never those.
- `src/kit/` is shared with Toolbench and Voicebench, copied verbatim: change it there too, or not at all.
- Sources ruled out for unreliable data: Digicamdb, Camera Decision, Versus, DXOMARK, PXLMAG (Kevin, 2026-11-05).
- A page fetched in the last 30 days is never fetched again; its saved Markdown is reused.
