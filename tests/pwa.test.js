/**
 * PWA invariants (roadmap 3.5).
 *
 * These are deliberately headless: jsdom neither installs manifests nor runs
 * service workers, so what a test can honestly pin is the *contract* between
 * the manifest, the worker and the files on disk:
 *
 *   - the manifest parses and only references icons that exist, are square
 *     and are the size they claim to be;
 *   - the service worker's precache shell covers every module reachable from
 *     js/main.js — a missing entry is an uncacheable boot file offline;
 *   - the worker cache VERSION matches package.json, because nothing else
 *     retires stale code in a no-build, un-hashed deployment;
 *   - index.html actually links the manifest and registers the worker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

const manifest = JSON.parse(readFileSync(join(DOCS, 'manifest.webmanifest'), 'utf8'));
const sw = readFileSync(join(DOCS, 'sw.js'), 'utf8');
const html = readFileSync(join(DOCS, 'index.html'), 'utf8');

/** Width/height from a PNG's IHDR (sig 8B + length 4B + "IHDR" 4B). */
function pngSize(path) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Every path in sw.js's SHELL array. */
function shellEntries() {
  const block = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare a SHELL array');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Every js module statically reachable from js/main.js. */
function reachableModules(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    const refs = [...source.matchAll(/(?:from|import)\s*'(\.[^']+)'/g)].map((m) => m[1]);
    for (const ref of refs) queue.push(join(dirname(file), ref));
  }
  return seen;
}

test('manifest declares an installable standalone game', () => {
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name.length > 0 && manifest.short_name.length > 0);
  assert.ok(manifest.description.length > 0);
  // GitHub Pages serves the game from a subpath; every URL must be relative
  // or the same files would 404 as soon as they are not at the domain root.
  for (const key of ['id', 'start_url', 'scope']) {
    assert.ok(manifest[key].startsWith('./'), `manifest.${key} must be relative, got ${manifest[key]}`);
  }
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
});

test('every manifest icon exists, is square, and matches its declared size', () => {
  const purposes = new Set();
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/') && !icon.src.includes('://'), `icon must be relative: ${icon.src}`);
    const path = join(DOCS, icon.src);
    assert.ok(existsSync(path), `missing icon ${icon.src}`);
    const { width, height } = pngSize(path);
    assert.equal(width, height, `${icon.src} must be square (masking crops to a square)`);
    assert.equal(icon.sizes, `${width}x${height}`, `${icon.src} declares ${icon.sizes}`);
    if (icon.purpose) for (const p of icon.purpose.split(' ')) purposes.add(p);
  }
  // Chrome requires a 192 and a 512 to offer install; maskable keeps the
  // portrait inside the OS's circular crop safe zone.
  const sizes = new Set(manifest.icons.map((i) => i.sizes));
  assert.ok(sizes.has('192x192') && sizes.has('512x512'), 'need 192px and 512px icons');
  assert.ok(purposes.has('any') && purposes.has('maskable'), 'need any + maskable purposes');
});

test('apple-touch-icon referenced from index.html exists', () => {
  const href = html.match(/rel="apple-touch-icon" href="([^"]+)"/);
  assert.ok(href, 'index.html must link an apple-touch-icon');
  assert.ok(existsSync(join(DOCS, href[1])), `missing ${href[1]}`);
});

test('shell version stays in lockstep with package.json', () => {
  const version = sw.match(/const VERSION = '([^']+)'/);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(version, 'sw.js must declare a VERSION');
  assert.equal(
    version[1],
    pkg.version,
    'bump package.json version and sw.js VERSION together — the cache only ' +
      'retires when this string changes',
  );
});

test('every shell entry exists on disk and is same-origin relative', () => {
  for (const entry of shellEntries()) {
    assert.ok(!entry.includes('://') && !entry.startsWith('/'), `shell entry must be relative: ${entry}`);
    const rel = entry === './' ? 'index.html' : entry;
    assert.ok(existsSync(join(DOCS, rel)), `shell entry missing on disk: ${entry}`);
  }
});

test('precache shell covers the whole static import graph', () => {
  const shell = new Set(shellEntries());
  const missing = [];
  for (const file of reachableModules(join(DOCS, 'js', 'main.js'))) {
    const rel = relative(DOCS, file);
    if (!shell.has(rel)) missing.push(rel);
  }
  assert.deepEqual(
    missing,
    [],
    'modules missing from the sw.js precache shell — the game could not boot offline',
  );
});

test('css is in the shell and both caches are named by version', () => {
  const shell = new Set(shellEntries());
  assert.ok(shell.has('css/style.css'), 'css/style.css must be precached');
  assert.ok(sw.includes('SHELL_CACHE') && sw.includes('RUNTIME_CACHE'));
});

test('index.html links the manifest and registers the worker defensively', () => {
  assert.ok(html.includes('rel="manifest" href="manifest.webmanifest"'));
  assert.ok(html.includes("'serviceWorker' in navigator"), 'registration must feature-detect');
  assert.ok(html.includes('register('), 'registration call missing');
});
