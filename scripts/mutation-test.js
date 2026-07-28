#!/usr/bin/env node
/**
 * Mutation testing for the rules layer (roadmap 3.4).
 *
 * Coverage counts executed lines; it cannot tell you whether a test would
 * notice if a line said the *wrong thing*. This script proves it the hard
 * way: it introduces a small, deliberate bug, runs the tests that should
 * catch it, and requires them to fail. Every returned test suite is the
 * detection claim; a surviving mutant is a genuine test gap, printed in
 * red, and the exit code follows.
 *
 * Mutants are hand-written, each aimed at a seam where a wrong number or a
 * dropped guard costs a player something real:
 *
 *   rent arithmetic        a day later or a cap lower is free money
 *   save migration         older saves must keep loading forever
 *   save slots             unknown keys must be refused, never "cleared"
 *   reputation gates       gated fiction must stay gated
 *   weather visibility     a storm-shut market must stay on the board
 *   variance clamps        a paid day must never flip to a costly day
 *   the friend pool        the reunion event must not summon your nemesis
 *
 * Usage: node scripts/mutation-test.js [--quiet]
 *
 * The script restores every mutated file even if it is killed mid-run, and
 * it refuses to start from a dirty checkout of the files it would touch.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');

const DATA = 'docs/js';
const MUTANTS = [
  {
    id: 'rent-starts-25',
    file: `${DATA}/core/balance.js`,
    find: 'export const RENT_ESCALATION_FIRST_DAY = 15;',
    replace: 'export const RENT_ESCALATION_FIRST_DAY = 25;',
    why: 'ten extra days at base rent is free money the whole economy is priced around',
    tests: ['tests/balance.test.js', 'tests/progression.test.js', 'tests/systems.test.js'],
  },
  {
    id: 'rent-cap-36',
    file: `${DATA}/core/balance.js`,
    find: 'export const RENT_MAX_AMOUNT = 42.0;',
    replace: 'export const RENT_MAX_AMOUNT = 36.0;',
    why: 'a lower ceiling softens the late-game pressure the win rate is measured against',
    tests: ['tests/balance.test.js', 'tests/progression.test.js'],
  },
  {
    id: 'saves-v7-only',
    file: `${DATA}/core/game-state.js`,
    find: 'export const SUPPORTED_SAVE_VERSIONS = Object.freeze([3, 4, 5, 6, 7]);',
    replace: 'export const SUPPORTED_SAVE_VERSIONS = Object.freeze([7]);',
    why: 'every existing player\u2019s save becomes unloadable at the next schema bump',
    tests: ['tests/systems.test.js', 'tests/game.test.js'],
  },
  {
    id: 'clear-accepts-unknown-slots',
    file: `${DATA}/core/game-state.js`,
    find: `    // Refuse unknown keys like save/load/has do: a caller typo must surface
    // as \`false\`, not as a silent no-op that reports success.
    if (!SAVE_SLOTS.some((s) => s.key === key)) return false;`,
    replace: `    if (false) return false;`,
    why: 'a caller typo would silently no-op and report success (the bug this guard fixes)',
    tests: ['tests/systems.test.js'],
  },
  {
    id: 'reputation-gate-off',
    file: `${DATA}/core/event-manager.js`,
    find: 'if ((e.minReputation ?? 0) > (context.reputation ?? 0)) return false;',
    replace: 'if (false) return false;',
    why: 'the four rep-gated beats fire from day one; standing stops buying fiction',
    tests: ['tests/cast.test.js'],
  },
  {
    id: 'weather-invisible-again',
    file: `${DATA}/data/locations.js`,
    find: 'const progressSnap = { ...snap, closedTags: [] };',
    replace: 'const progressSnap = snap;',
    why: 'reverts the v2.6 weather-visibility fix: a storm-shut market vanishes from the hub again',
    tests: ['tests/slots.test.js'],
  },
  {
    id: 'variance-may-invert',
    file: `${DATA}/data/locations.js`,
    find: 'if (base > 0 && base + raw < 0) out[key] = -base;',
    replace: 'if (base > 0 && base + raw < 0) out[key] = raw;',
    why: 'a bar shift could pay negative money; the hub card promises never inverted contracts',
    tests: ['tests/world.test.js', 'tests/slots.test.js'],
  },
  {
    id: 'energy-recovery-halved',
    file: `${DATA}/core/balance.js`,
    find: 'export const ENERGY_FULL_RECOVERY_DAYS = 7;',
    replace: 'export const ENERGY_FULL_RECOVERY_DAYS = 14;',
    why: 'recovery is the entire energy economy\u2019s heartbeat; half of it must sink the sims\u2019 win rates',
    tests: ['tests/balance.test.js', 'tests/systems.test.js'],
  },
  {
    id: 'friend-pool-everyone',
    file: `${DATA}/core/game-state.js`,
    find: 'return this.characterProfiles.filter((p) => p.role === Role.SIDE_CHARACTER).map((p) => p.name);',
    replace: "return this.characterProfiles.filter((p) => p.id !== 'leon').map((p) => p.name);",
    why: 'the warm-reunion event can summon Kaden again — the man suing the community',
    tests: ['tests/game.test.js'],
  },
];

// ------------------------------------------------------------- safety net
const originals = new Map();
for (const m of MUTANTS) {
  originals.set(m.file, readFileSync(join(ROOT, m.file), 'utf8'));
}

function restoreAll() {
  for (const [file, src] of originals) writeFileSync(join(ROOT, file), src);
}

for (const sig of ['SIGINT', 'SIGTERM', 'uncaughtException', 'exit']) {
  process.on(sig, () => {
    restoreAll();
    if (sig === 'uncaughtException') process.exitCode = 2;
  });
}

// Refuse to run over uncommitted edits to the touched files: a mutation
// storm is exactly where "oops, that was my change" happens.
for (const m of MUTANTS) {
  try {
    const out = execSync(`git status --porcelain -- ${m.file}`, { cwd: ROOT }).toString().trim();
    if (out) {
      console.error(`error: ${m.file} has uncommitted changes — commit or stash first.`);
      process.exit(2);
    }
  } catch {
    // Not a git checkout: proceed, the restore net still applies.
  }
}

// ---------------------------------------------------------------- runner
function runTests(files) {
  const started = Date.now();
  try {
    execFileSync(process.execPath, ['--test', ...files], {
      cwd: ROOT,
      stdio: QUIET ? 'pipe' : 'ignore',
      timeout: 300000,
    });
    return { died: false, ms: Date.now() - started };
  } catch (e) {
    if (e.killed) return { died: null, ms: Date.now() - started, error: 'timeout' };
    return { died: true, ms: Date.now() - started };
  }
}

console.log(`\nMutation testing ${MUTANTS.length} mutants over the rules layer…\n`);
const survivors = [];
const errors = [];

for (const m of MUTANTS) {
  const path = join(ROOT, m.file);
  const original = originals.get(m.file);
  const occurrences = original.split(m.find).length - 1;
  if (occurrences !== 1) {
    errors.push(m.id);
    console.log(`? ${m.id}  — anchor text occurs ${occurrences} times in ${m.file}; mutant not applied`);
    continue;
  }
  writeFileSync(path, original.replace(m.find, m.replace));
  const { died, ms, error } = runTests(m.tests);
  writeFileSync(path, original);

  if (error) {
    errors.push(m.id);
    console.log(`? ${m.id}  — ${error} running ${m.tests.join(' ')}`);
  } else if (died) {
    console.log(`✓ ${m.id}  killed in ${(ms / 1000).toFixed(1)}s  (${m.why})`);
  } else {
    survivors.push(m);
    console.log(`✗ ${m.id}  SURVIVED ${m.tests.join(' ')}  — ${m.why}`);
  }
}

restoreAll(); // belt and braces — files are restored after every mutant anyway.

console.log(
  `\n${MUTANTS.length - survivors.length - errors.length}/${MUTANTS.length} mutants killed, ` +
    `${survivors.length} survived, ${errors.length} errors.`,
);

if (survivors.length > 0) {
  console.log('\nSurvivors are test gaps. These mutants shipped and nobody noticed:');
  for (const m of survivors) console.log(`  - ${m.id}: ${m.why}  (${m.file})`);
}
process.exit(survivors.length > 0 || errors.length > 0 ? 1 : 0);
