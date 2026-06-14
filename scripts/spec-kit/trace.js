#!/usr/bin/env node
/**
 * Generate / verify the traceability matrix for a spec-driven feature.
 *
 * Usage:
 *   node scripts/spec-kit/trace.js <feature-dir> [--write] [--json] [--allow-gaps] [--strict]
 *
 * Parses FR-/SC-/DES-/T### across spec.md, design.md, tasks.md, scans tests/**
 * for referencing IDs, builds the trace matrix, and:
 *   - with --write: writes trace.md into the feature dir
 *   - exits non-zero on structural orphans (unless --allow-gaps)
 *   - with --strict: missing-test gaps also fail the exit code
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

function parseArgs(argv) {
  const args = { _: [], write: false, json: false, allowGaps: false, strict: false };
  for (const a of argv) {
    if (a === '--write') args.write = true;
    else if (a === '--json') args.json = true;
    else if (a === '--allow-gaps') args.allowGaps = true;
    else if (a === '--strict') args.strict = true;
    else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = lib.findRepoRoot();
  const featureDir = args._[0] ? path.resolve(args._[0]) : null;

  if (!featureDir || !fs.existsSync(featureDir)) {
    process.stderr.write('Usage: trace.js <feature-dir> [--write] [--json] [--allow-gaps] [--strict]\n');
    process.exit(2);
  }

  const trace = lib.buildTrace(featureDir, { repoRoot, allowGaps: args.allowGaps });

  let exitCode = trace.exitCode;
  if (args.strict && trace.summary.gaps > 0) exitCode = 1;

  if (args.write) {
    const md = lib.renderTraceMarkdown(featureDir, trace, { repoRoot });
    fs.writeFileSync(path.join(featureDir, 'trace.md'), md);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(trace, null, 2) + '\n');
  } else {
    process.stdout.write(`Traceability: ${trace.featureName}\n`);
    process.stdout.write(`  FR=${trace.summary.frs} SC=${trace.summary.scs} DES=${trace.summary.des} T=${trace.summary.tasks} (done ${trace.summary.tasksDone})\n`);
    process.stdout.write(`  Requirements with tests: ${trace.summary.reqsWithTests}/${trace.summary.frs}\n`);
    if (trace.gaps.length) {
      process.stdout.write('  Coverage gaps:\n');
      for (const g of trace.gaps) process.stdout.write(`    - ${g}\n`);
    } else {
      process.stdout.write('  No coverage gaps.\n');
    }
    if (args.write) process.stdout.write(`  Wrote ${path.join(featureDir, 'trace.md')}\n`);
  }

  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs };
