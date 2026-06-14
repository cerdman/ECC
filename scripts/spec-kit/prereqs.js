#!/usr/bin/env node
/**
 * Check spec-driven-workflow prerequisites for a feature.
 *
 * Usage:
 *   node scripts/spec-kit/prereqs.js [feature-dir] [--json] [--require design,tasks]
 *
 * Without a feature dir, resolves the most recently modified feature under specs/.
 * Replicates spec-kit's check-prerequisites: reports presence of constitution,
 * spec.md, design.md, tasks.md, trace.md and the list of available docs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

function parseArgs(argv) {
  const args = { _: [], json: false, require: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--require') args.require = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else args._.push(a);
  }
  return args;
}

function resolveFeatureDir(arg, repoRoot) {
  if (arg) return path.resolve(arg);
  const dirs = lib.listFeatureDirs(repoRoot);
  if (dirs.length === 0) return null;
  // Most recently modified by .state.json / spec.md mtime.
  let best = dirs[0];
  let bestM = 0;
  for (const d of dirs) {
    for (const f of ['.state.json', 'spec.md']) {
      try {
        const m = fs.statSync(path.join(d, f)).mtimeMs;
        if (m > bestM) { bestM = m; best = d; }
      } catch (_) { /* ignore */ }
    }
  }
  return best;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = lib.findRepoRoot();
  const featureDir = resolveFeatureDir(args._[0], repoRoot);

  const docs = {
    constitution: fs.existsSync(lib.constitutionPath(repoRoot)),
    spec: featureDir ? fs.existsSync(path.join(featureDir, 'spec.md')) : false,
    design: featureDir ? fs.existsSync(path.join(featureDir, 'design.md')) : false,
    tasks: featureDir ? fs.existsSync(path.join(featureDir, 'tasks.md')) : false,
    trace: featureDir ? fs.existsSync(path.join(featureDir, 'trace.md')) : false
  };

  const available = [];
  if (featureDir && fs.existsSync(featureDir)) {
    for (const f of ['spec.md', 'design.md', 'tasks.md', 'trace.md', 'research.md', 'quickstart.md', 'data-model.md', 'agent_execution_plan.md']) {
      if (fs.existsSync(path.join(featureDir, f))) available.push(f);
    }
    if (fs.existsSync(path.join(featureDir, 'contracts'))) available.push('contracts/');
  }

  const state = featureDir ? lib.readState(featureDir) : null;
  const missing = args.require.filter(r => !docs[r]);

  const payload = {
    REPO_ROOT: repoRoot,
    FEATURE_DIR: featureDir,
    CONSTITUTION: lib.constitutionPath(repoRoot),
    DOCS: docs,
    AVAILABLE_DOCS: available,
    STATE: state,
    MISSING: missing,
    OK: missing.length === 0 && Boolean(featureDir)
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    process.stdout.write(`Feature dir: ${featureDir || '(none found)'}\n`);
    process.stdout.write(`Constitution: ${docs.constitution ? 'yes' : 'no'}\n`);
    process.stdout.write(`spec.md: ${docs.spec ? 'yes' : 'no'}  design.md: ${docs.design ? 'yes' : 'no'}  tasks.md: ${docs.tasks ? 'yes' : 'no'}  trace.md: ${docs.trace ? 'yes' : 'no'}\n`);
    if (available.length) process.stdout.write(`Available: ${available.join(', ')}\n`);
    if (missing.length) process.stdout.write(`Missing required: ${missing.join(', ')}\n`);
  }

  process.exit(missing.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, resolveFeatureDir };
