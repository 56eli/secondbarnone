#!/usr/bin/env node
/**
 * Runs the test suite with coverage and fails if it drops below threshold.
 *
 *   npm run coverage:check
 *
 * Node's built-in coverage prints a table but always exits 0, so this wraps it
 * and enforces the numbers. Thresholds are deliberately a little below the
 * current figures, leaving room for honest churn without letting coverage rot.
 */

import { spawnSync } from 'node:child_process';

const THRESHOLDS = {
  line: 80,
  branch: 80,
  function: 80,
};

const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-exclude=tests/**',
    '--test-coverage-exclude=scripts/**',
    // An explicit glob, not the bare directory: some Node versions resolve
    // `tests/` as a module path and silently run nothing.
    'tests/**/*.test.js',
  ],
  { encoding: 'utf8', cwd: process.cwd() },
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

if (result.status !== 0) {
  console.error('\n✗ Tests failed — not evaluating coverage.');
  process.exit(1);
}

// The summary row looks like:
//   ℹ all files           |  99.94 |    96.34 |   99.02 |
const summary = output
  .split('\n')
  .find((line) => line.includes('all files'));

if (!summary) {
  console.error('\n✗ Could not find the coverage summary row.');
  process.exit(1);
}

const numbers = summary.match(/\d+\.\d+/g);
if (!numbers || numbers.length < 3) {
  console.error(`\n✗ Could not parse coverage from: ${summary}`);
  process.exit(1);
}

const [line, branch, func] = numbers.map(Number);
const actual = { line, branch, function: func };

console.log('\nCoverage gate');
let failed = false;
for (const [metric, min] of Object.entries(THRESHOLDS)) {
  const value = actual[metric];
  const ok = value >= min;
  if (!ok) failed = true;
  console.log(`  ${ok ? '✓' : '✗'} ${metric.padEnd(9)} ${value.toFixed(2)}%  (min ${min}%)`);
}

if (failed) {
  console.error('\n✗ Coverage below threshold.');
  process.exit(1);
}
console.log('\n✓ Coverage thresholds met.');
