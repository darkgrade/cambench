[![Cambench by Darkgrade](https://darkgrade.com/cambench/og/index.png)](https://darkgrade.com/cambench/)

# Cambench

**[See the results →](https://darkgrade.com/cambench/)**

Every camera body's specs, read from the makers' own sites, B&H, DPReview, launch news, Wikipedia and more,
standardized to one set of about 45 specs and verified across independent sources. Each camera gets a spec
level from 0 to 100 on fixed scales. Served at darkgrade.com/cambench.

## How it works

The fetch runs as a workflow in Outpost (the Cambench app, installed from this repository): discover the
newest bodies on B&H, find each on every source, scrape each page to Markdown, have agents read each page
against the spec dictionary, verify, score, cut out product pictures, then publish. The saved pages, readings
and every candidate picture stay in Outpost; only `results/` (what the site shows) and the approved pictures
in `public/cameras/` are committed here, by the workflow.

The site is static. It opens on a story told with every reading as a point of light (one thing one website
says about one camera), then lets you place the cameras on your own axes, line the bodies up at true size,
see which sources agree with which, and compare two cameras. Each camera has its own page with every spec,
who states it and the words it was read from.

```sh
bun install
bun run dev      # the site
bun run build    # static site in dist/cambench
```

`bun run data` (run by both) turns `results/` into what the views load: `public/data/` and a few small tallies
in `src/`, none of them committed.

`outpost/` is the Outpost app: its MCP server and page (the workflow's runs and what starts them), the pipeline
(`pipeline.ts`, `reads.ts`, `consensus.ts`, `level.ts`), and `workflow.ts`.
