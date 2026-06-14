#!/usr/bin/env node
/**
 * Return the next clean-session implementation slice for a spec feature.
 *
 * Usage:
 *   node scripts/spec-kit/slice.js <feature-dir> [--json]
 *
 * Picks foundational (no story) open tasks first, then the earliest user story.
 * Within a wave, all `[P]` open tasks in that group are returned together.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

function parseArgs(argv) {
  const args = { _: [], json: false };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const featureDir = args._[0] ? path.resolve(args._[0]) : null;

  if (!featureDir || !fs.existsSync(path.join(featureDir, 'tasks.md'))) {
    process.stderr.write('Usage: slice.js <feature-dir> [--json]\n');
    process.exit(2);
  }

  const result = lib.getNextSlice(featureDir);
  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (!result.slice) {
    process.stdout.write(`${result.reason || 'no slice'}\n`);
  } else {
    const s = result.slice;
    process.stdout.write(`Next slice: ${s.kind}${s.story ? ' ' + s.story : ''} — ${s.tasks.join(', ')}${s.parallel ? ' [P]' : ''}\n`);
  }
  process.exit(result.slice ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs };
