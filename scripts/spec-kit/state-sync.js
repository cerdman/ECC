#!/usr/bin/env node
/**
 * Sync spec-driven-workflow project state into the ecc2 control plane.
 *
 * Usage:
 *   node scripts/spec-kit/state-sync.js [feature-dir] [--json] [--no-ecc]
 *
 * For each feature (one if a dir is given, else all under specs/):
 *   - recomputes task progress + coverage from the docs (via trace)
 *   - refreshes .state.json (phase/progress/gates mirror)
 *   - writes a durable snapshot to ~/.claude/spec-kit/<feature>.json
 *   - best-effort upserts into ecc2.db via the `ecc` CLI
 *     (log-decision on phase change, graph add-entity for the feature)
 *
 * Degrades gracefully when the `ecc` binary is unavailable: local state and the
 * snapshot are always updated. This is the script the ~15-min `ecc schedule`
 * job runs asynchronously.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('./lib');

function parseArgs(argv) {
  const args = { _: [], json: false, ecc: true };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--no-ecc') args.ecc = false;
    else args._.push(a);
  }
  return args;
}

function snapshotDir() {
  return path.join(os.homedir(), '.claude', 'spec-kit');
}

function resolveEccBin(repoRoot) {
  if (process.env.ECC_BIN && fs.existsSync(process.env.ECC_BIN)) return process.env.ECC_BIN;
  const exe = process.platform === 'win32' ? 'ecc.exe' : 'ecc';
  const candidates = [
    path.join(repoRoot, 'ecc2', 'target', 'release', exe),
    path.join(repoRoot, 'ecc2', 'target', 'debug', exe)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Fall back to PATH lookup.
  const which = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(which, ['ecc'], { encoding: 'utf8' });
  if (res.status === 0 && res.stdout.trim()) {
    return res.stdout.split(/\r?\n/)[0].trim();
  }
  return null;
}

function eccCall(bin, argv) {
  if (!bin) return { ok: false, skipped: true };
  const res = spawnSync(bin, argv, { encoding: 'utf8', timeout: 20000 });
  return { ok: res.status === 0, status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function computeProgress(featureDir, repoRoot) {
  const trace = lib.buildTrace(featureDir, { repoRoot, allowGaps: true });
  const pct = trace.summary.tasks > 0
    ? Math.round((trace.summary.tasksDone / trace.summary.tasks) * 100)
    : 0;
  return { trace, pct };
}

function syncFeature(featureDir, repoRoot, opts) {
  // State -> docs: apply completedTasks to tasks.md checkboxes before recomputing.
  const taskSync = lib.syncTasksFromState(featureDir);

  const state = lib.readState(featureDir) || lib.defaultState(path.basename(featureDir));
  const { trace, pct } = computeProgress(featureDir, repoRoot);

  const prevPhase = state.phase;
  const next = {
    ...state,
    progress: {
      tasks: trace.summary.tasks,
      tasksDone: trace.summary.tasksDone,
      percent: pct,
      reqsWithTests: trace.summary.reqsWithTests,
      gaps: trace.summary.gaps
    },
    coverage: trace.summary
  };
  lib.writeState(featureDir, next);

  // Durable snapshot for the dashboard / ecc2 sync.
  lib.ensureDir(snapshotDir());
  const snapshot = {
    feature: next.feature,
    uid: next.uid,
    phase: next.phase,
    active: next.active,
    gate: next.gate,
    progress: next.progress,
    featureDir: path.relative(repoRoot, featureDir).split(path.sep).join('/'),
    updated: new Date().toISOString()
  };
  fs.writeFileSync(path.join(snapshotDir(), `${next.feature}.json`), JSON.stringify(snapshot, null, 2) + '\n');

  // Best-effort ecc2 upsert.
  const ecc = { synced: false };
  if (opts.ecc) {
    const bin = resolveEccBin(repoRoot);
    if (bin) {
      const entity = eccCall(bin, [
        'graph', 'add-entity',
        '--type', 'spec-feature',
        '--name', next.feature,
        '--summary', `phase=${next.phase} progress=${pct}% tasks=${trace.summary.tasksDone}/${trace.summary.tasks} gaps=${trace.summary.gaps}`,
        '--json'
      ]);
      let decision = { ok: true };
      if (prevPhase !== next.phase) {
        decision = eccCall(bin, [
          'log-decision',
          '--decision', `spec ${next.feature} -> phase ${next.phase}`,
          '--reasoning', `Auto-synced by spec-kit state-sync; progress ${pct}%.`
        ]);
      }
      ecc.synced = Boolean(entity.ok);
      ecc.bin = bin;
      ecc.entity = entity.ok;
      ecc.decision = decision.ok;
    } else {
      ecc.reason = 'ecc binary not found';
    }
  }

  return {
    feature: next.feature,
    progress: next.progress,
    phase: next.phase,
    taskSync,
    ecc,
    snapshot: path.join(snapshotDir(), `${next.feature}.json`)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = lib.findRepoRoot();

  let dirs;
  if (args._[0]) {
    dirs = [path.resolve(args._[0])];
  } else {
    dirs = lib.listFeatureDirs(repoRoot);
  }

  const results = [];
  for (const d of dirs) {
    if (!fs.existsSync(path.join(d, 'spec.md'))) continue;
    results.push(syncFeature(d, repoRoot, { ecc: args.ecc }));
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({ count: results.length, results }, null, 2) + '\n');
  } else if (results.length === 0) {
    process.stdout.write('No spec features found to sync.\n');
  } else {
    for (const r of results) {
      const ecc = r.ecc.synced ? 'ecc2:synced' : `ecc2:skipped${r.ecc.reason ? ' (' + r.ecc.reason + ')' : ''}`;
      process.stdout.write(`${r.feature}  phase=${r.phase}  ${r.progress.percent}% (${r.progress.tasksDone}/${r.progress.tasks})  ${ecc}\n`);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, resolveEccBin, computeProgress };
