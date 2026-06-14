#!/usr/bin/env node
/**
 * Register the ~15-minute ecc schedule job for spec-kit state-sync.
 *
 * Usage:
 *   node scripts/spec-kit/register-schedule.js [--json] [--dry-run]
 *
 * Idempotent: skips registration if an equivalent job already exists in
 * `ecc schedule list`. Falls back to printing a manual cron one-liner when the
 * `ecc` binary is unavailable.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('./lib');
const { resolveEccBin } = require('./state-sync');

const CRON = '*/15 * * * *';
const JOB_MARKER = 'scripts/spec-kit/state-sync.js';

function parseArgs(argv) {
  const args = { json: false, dryRun: false };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function eccList(bin) {
  const res = spawnSync(bin, ['schedule', 'list', '--json'], { encoding: 'utf8', timeout: 15000 });
  if (res.status !== 0) return [];
  try {
    const data = JSON.parse(res.stdout || '[]');
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function hasExistingJob(bin) {
  const jobs = eccList(bin);
  return jobs.some(j => {
    const task = String(j.task || j.Task || '');
    const cron = String(j.cron_expr || j.cron || '');
    return task.includes(JOB_MARKER) && cron === CRON;
  });
}

function manualCronLine(repoRoot) {
  const script = path.join(repoRoot, 'scripts', 'spec-kit', 'state-sync.js');
  if (process.platform === 'win32') {
    return `schtasks /Create /SC MINUTE /MO 15 /TN "ecc-spec-kit-sync" /TR "node \\"${script}\\""`;
  }
  return `${CRON} cd ${repoRoot} && node ${script} >> ~/.claude/spec-kit/sync.log 2>&1`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = lib.findRepoRoot();
  const syncScript = path.join(repoRoot, 'scripts', 'spec-kit', 'state-sync.js');
  const taskText = `Sync spec-driven workflow state: run \`node ${syncScript}\` from repo root \`${repoRoot}\` and report feature counts.`;
  const bin = resolveEccBin(repoRoot);

  const payload = {
    cron: CRON,
    script: syncScript,
    registered: false,
    method: null,
    manual: manualCronLine(repoRoot)
  };

  if (!bin) {
    payload.method = 'manual';
    payload.reason = 'ecc binary not found';
  } else if (hasExistingJob(bin)) {
    payload.method = 'ecc';
    payload.registered = true;
    payload.reason = 'already registered';
  } else if (args.dryRun) {
    payload.method = 'ecc';
    payload.dryRun = true;
    payload.command = [
      bin, 'schedule', 'add',
      '--cron', CRON,
      '--task', taskText,
      '--agent', 'claude',
      '--project', 'ecc-spec-kit',
      '--task-group', 'spec-driven-workflow'
    ];
  } else {
    const res = spawnSync(bin, [
      'schedule', 'add',
      '--cron', CRON,
      '--task', taskText,
      '--agent', 'claude',
      '--project', 'ecc-spec-kit',
      '--task-group', 'spec-driven-workflow',
      '--json'
    ], { encoding: 'utf8', timeout: 20000 });
    payload.method = 'ecc';
    payload.registered = res.status === 0;
    payload.status = res.status;
    if (res.stdout) {
      try { payload.schedule = JSON.parse(res.stdout); } catch (_) { payload.stdout = res.stdout; }
    }
    if (res.stderr) payload.stderr = res.stderr;
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else if (payload.registered && payload.reason === 'already registered') {
    process.stdout.write(`Schedule already registered (${CRON} -> state-sync.js).\n`);
  } else if (payload.registered) {
    process.stdout.write(`Registered ecc schedule: ${CRON} -> state-sync.js\n`);
  } else if (payload.dryRun) {
    process.stdout.write(`Dry-run: ${payload.command.join(' ')}\n`);
  } else {
    process.stdout.write(`Could not register via ecc (${payload.reason || 'failed'}).\n`);
    process.stdout.write(`Manual fallback:\n  ${payload.manual}\n`);
  }

  process.exit(payload.registered || payload.dryRun ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, hasExistingJob, manualCronLine };
