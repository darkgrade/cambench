/**
 * The Cambench worker: serves the workflow's tasks (fetching, reading by agents, publishing) until stopped.
 * Outpost runs it from its own copy of this repository and restarts it on new commits.
 *
 *   bun run worker
 */
import { cambench } from './workflow.ts';

const { serve } = await cambench();
console.log('cambench worker: ready');
await serve('cambench', { slots: 8 });
