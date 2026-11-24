# Cambench

A database of camera specs verified across independent sources, published at darkgrade.com/cambench. Read
README.md first.

- `outpost/` is the Outpost plugin: only the workflow (`outpost/workflow.ts`), served by its worker
  (`outpost/worker.ts`), which Outpost runs on the Mac from this repository's latest commit. Its database
  (`camera-atlas.db`), saved pages and pictures live in the plugin's data folder in Outpost. Never commit those:
  only `results/cambench.json`, `results/cameras/*.json` and `public/cameras/*.webp`, which the workflow's publish
  step writes. Reading, settling disagreements and reviewing pictures are tasks of the workflow: each agent gets
  what it needs in its brief and answers in JSON, and the worker checks and saves it. No page, no MCP server:
  runs and their graph are Outpost's Runs pages; the results are shown on the site.
- `src/` is the static site (Vite, React, `@kevinschaich/components`), prerendered by `scripts/prerender.ts`.
  `scripts/build-data.ts` runs first (`bun run data`, and before `dev` and `build`): it turns `results/` into
  what the views load (`public/data/`: every reading in columns, each camera's quotes, the disagreements, small
  pictures cut down to the body) and three small tallies they bundle (`src/facts.json`, `src/agreement.json`,
  `src/bodies.json`). None of that is committed. Every number a caption quotes comes from those files.
- The overview (`src/app.tsx`) is the Story and the other views (`src/views/`), each at its own path; a camera's
  own page (`src/entry.tsx`, `src/pages/camera.tsx`) loads separately and reads its detail embedded in the page.
  Camera page addresses, titles and descriptions are indexed: change the page, never those.
- `src/kit/` is shared with Toolbench and Voicebench, copied verbatim: change it there too, or not at all.
- The results are a schema.org `Dataset` (`structuredData` in `scripts/prerender.ts`, the same in all three benches):
  MIT licensed like the code (`LICENSE`), described by `BENCH.dataset`, with `results/<bench>.json` copied to
  `data/<bench>.json` beside the pages as its download. Keep it complete for Google's Dataset rich results.
- Sources ruled out for unreliable data: Digicamdb, Camera Decision, Versus, DXOMARK, PXLMAG (Kevin, 2026-11-05).
- A page fetched in the last 30 days is never fetched again; its saved Markdown is reused.
