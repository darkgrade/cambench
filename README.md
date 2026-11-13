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

```sh
bun install
bun run dev      # the site
bun run build    # static site in dist/cambench
```

`outpost/` is the Outpost app: its MCP server and page, the pipeline (`pipeline.ts`, `reads.ts`,
`consensus.ts`, `level.ts`), and `workflow.ts`.
