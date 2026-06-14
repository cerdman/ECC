#!/usr/bin/env node
/**
 * Scaffold a new spec-driven feature directory under specs/.
 *
 * Usage:
 *   node scripts/spec-kit/feature.js new "<feature description>" [--json] [--name slug] [--branch]
 *
 * Replicates spec-kit's create-new-feature: allocates <NNN-slug>, copies the
 * spec template, writes .state.json with a feature uid, and (optionally) creates
 * a git branch.
 */

'use strict';

const { spawnSync } = require('child_process');
const lib = require('./lib');

function parseArgs(argv) {
  const args = { _: [], json: false, branch: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--branch') args.branch = true;
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--number') args.number = argv[++i];
    else args._.push(a);
  }
  return args;
}

function createBranch(repoRoot, featureId) {
  const res = spawnSync('git', ['-C', repoRoot, 'checkout', '-b', featureId], { encoding: 'utf8' });
  return res.status === 0;
}

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const args = parseArgs(argv.slice(1));

  if (sub !== 'new') {
    process.stderr.write('Usage: feature.js new "<description>" [--json] [--name slug] [--branch]\n');
    process.exit(2);
  }

  const description = args._.join(' ').trim();
  if (!description) {
    process.stderr.write('Error: feature description is required\n');
    process.exit(2);
  }

  let result;
  try {
    result = lib.createFeature(description, { shortName: args.name, number: args.number });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  let branchCreated = false;
  if (args.branch) {
    branchCreated = createBranch(result.repoRoot, result.featureId);
  }

  const payload = {
    FEATURE_ID: result.featureId,
    FEATURE_DIR: result.featureDir,
    SPEC_FILE: result.specFile,
    FEATURE_UID: result.uid,
    BRANCH_CREATED: branchCreated
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    process.stdout.write(`Created feature ${result.featureId}\n`);
    process.stdout.write(`  dir:  ${result.featureDir}\n`);
    process.stdout.write(`  spec: ${result.specFile}\n`);
    process.stdout.write(`  uid:  ${result.uid}\n`);
    if (args.branch) process.stdout.write(`  branch: ${branchCreated ? result.featureId : '(not created)'}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs };
