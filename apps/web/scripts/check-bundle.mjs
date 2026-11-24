#!/usr/bin/env node
/**
 * Bundle budget guard (docs/optimization.md P2). Run after `next build`.
 *
 * The 3D engine (IWSDK + three, ~6 MB) is loaded lazily by the play pages only. Every statically prerendered page
 * (home, sign-in, templates, upload) must stay light: this script fails when one of them loads a chunk that contains
 * the engine, or when its JavaScript grows past the budget.
 *
 * Usage: node scripts/check-bundle.mjs   (from apps/web)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NEXT = join(process.cwd(), '.next');
const APP_PAGES = join(NEXT, 'server', 'app');
/** Raw JavaScript a light page may load, in bytes (measured 2026-11-24: ~715 KiB incl. React and Next, +25 %). */
const PAGE_JS_BUDGET = 900_000;
/** Strings that only exist in the engine chunk. */
const ENGINE_MARKERS = ['WebGPURenderer', 'iwsdk'];

function pagesOf(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.html') && f !== '_not-found.html' && f !== '404.html')
    .map((f) => join(dir, f));
}

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`✗ ${msg}`);
};

try {
  statSync(APP_PAGES);
} catch {
  console.error('check-bundle: no build output, run `pnpm -C apps/web build` first');
  process.exit(2);
}

for (const page of pagesOf(APP_PAGES)) {
  const html = readFileSync(page, 'utf8');
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/(chunks\/[A-Za-z0-9_.~-]+\.js)/g)].map((m) => m[1]))];
  let total = 0;
  for (const chunk of chunks) {
    const file = join(NEXT, 'static', chunk);
    const size = statSync(file).size;
    total += size;
    const source = readFileSync(file, 'utf8');
    const marker = ENGINE_MARKERS.find((m) => source.includes(m));
    if (marker) fail(`${page.split('/app/')[1]}: chunk ${chunk} contains the 3D engine ("${marker}")`);
  }
  const kib = Math.round(total / 1024);
  console.log(`${total > PAGE_JS_BUDGET ? '✗' : '✓'} ${page.split('/app/')[1]}: ${chunks.length} chunks, ${kib} KiB`);
  if (total > PAGE_JS_BUDGET) fail(`${page.split('/app/')[1]}: ${kib} KiB of JavaScript, budget ${Math.round(PAGE_JS_BUDGET / 1024)} KiB`);
}

if (failures > 0) process.exit(1);
console.log('check-bundle: ok');
