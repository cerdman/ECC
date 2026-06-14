#!/usr/bin/env node
/**
 * Spec implementation verification — constitution stack, tests, Codex review gate.
 *
 * Invoked from the Stop hook (spec-implementation-verify.js) or directly:
 *   node scripts/spec-kit/verify-implementation.js [--json] [--dry-run]
 *
 * Reads the session implementation batch (spec-implementation-accumulator), resolves
 * applicable constitutions, runs targeted tests, and optionally dispatches Codex
 * reviewer as an independent read-only subagent.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const lib = require('./lib');
const constitution = require('./constitution');
const accumulator = require('../hooks/spec-implementation-accumulator');

function parseArgs(argv) {
  const args = { json: false, dryRun: false, codex: null };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-codex') args.codex = false;
    else if (a === '--codex') args.codex = true;
  }
  return args;
}

function sessionId() {
  const raw = process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function detectTestCommand(repoRoot) {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test)) {
        return { cmd: 'npm', args: ['test', '--if-present'], cwd: repoRoot };
      }
    } catch (_) { /* ignore */ }
  }
  return null;
}

function runTests(repoRoot, testFiles, options) {
  if (options.dryRun) {
    return { ok: true, skipped: true, reason: 'dry-run', command: null };
  }

  const explicit = (testFiles || []).filter(f => fs.existsSync(path.join(repoRoot, f)));
  if (explicit.length) {
    const nodeTests = explicit.filter(f => /\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/.test(f));
    if (nodeTests.length) {
      const res = spawnSync(process.execPath, nodeTests.map(f => path.join(repoRoot, f)), {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 120000
      });
      return {
        ok: res.status === 0,
        command: `node ${nodeTests.join(' ')}`,
        stdout: (res.stdout || '').slice(0, 2000),
        stderr: (res.stderr || '').slice(0, 2000),
        status: res.status
      };
    }
  }

  const detected = detectTestCommand(repoRoot);
  if (!detected) {
    return { ok: true, skipped: true, reason: 'no test runner detected' };
  }

  const res = spawnSync(detected.cmd, detected.args, {
    cwd: detected.cwd,
    encoding: 'utf8',
    timeout: 300000,
    shell: process.platform === 'win32'
  });
  return {
    ok: res.status === 0,
    command: `${detected.cmd} ${detected.args.join(' ')}`,
    stdout: (res.stdout || '').slice(0, 2000),
    stderr: (res.stderr || '').slice(0, 2000),
    status: res.status
  };
}

function buildCodexTask(repoRoot, batch, constitutions, featureSummaries) {
  const lines = [];
  lines.push('<TASK>');
  lines.push('Independent implementation verification (read-only). You are NOT the implementing agent.');
  lines.push('');
  lines.push('## Implementation batch');
  lines.push(`Files edited: ${batch.files.join(', ') || '(none)'}`);
  for (const [fid, info] of Object.entries(batch.features)) {
    lines.push(`Feature ${fid}: tasks ${info.tasks.map(t => t.id).join(', ')}`);
  }
  lines.push('');
  lines.push('## Constitutions to enforce');
  for (const c of constitutions) {
    lines.push(`### [${c.layer}] ${c.path}`);
    lines.push((c.content || '').slice(0, 4000));
    lines.push('');
  }
  lines.push('## Feature context');
  lines.push(JSON.stringify(featureSummaries, null, 2));
  lines.push('');
  lines.push('Verify: (1) edits align with cited T### tasks and FR/DES ids,');
  lines.push('(2) no constitution violations, (3) tests adequate.');
  lines.push('OUTPUT: VERDICT: pass|blockers then prioritized findings.');
  lines.push('</TASK>');
  return lines.join('\n');
}

function runCodexReview(repoRoot, taskBody, options) {
  if (options.codex === false) {
    return { ok: true, skipped: true, reason: 'codex disabled' };
  }
  if (options.dryRun || process.env.ECC_DISPATCH_DRYRUN === '1') {
    return { ok: true, skipped: true, reason: 'dry-run', preview: taskBody.slice(0, 500) };
  }

  const runJs = path.join(repoRoot, 'scripts', 'dispatch', 'run.js');
  if (!fs.existsSync(runJs)) {
    return { ok: true, skipped: true, reason: 'dispatch/run.js not found' };
  }

  const tmpDir = path.join(os.tmpdir(), `ecc-verify-${lib.uuid().slice(0, 8)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const taskFile = path.join(tmpDir, 'task.md');
  const handoff = path.join(tmpDir, 'handoff.md');
  const status = path.join(tmpDir, 'status.md');
  fs.writeFileSync(taskFile, taskBody);

  const res = spawnSync(process.execPath, [runJs, 'codex', taskFile, handoff, status, 'reviewer'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 600000,
    env: { ...process.env, ECC_SPEC_VERIFY: '1' }
  });

  let output = res.stdout || '';
  try {
    output = fs.readFileSync(handoff, 'utf8');
  } catch (_) { /* use stdout */ }

  const blocked = /VERDICT:\s*blockers/i.test(output);
  const sessionMatch = output.match(/SESSION_ID:\s*(\S+)/);
  return {
    ok: !blocked && res.status === 0,
    blocked,
    output: output.slice(0, 8000),
    sessionId: sessionMatch ? sessionMatch[1] : null,
    status: res.status
  };
}

function collectTestFiles(repoRoot, batch) {
  const files = new Set();
  for (const info of Object.values(batch.features)) {
    const featureDir = path.join(repoRoot, info.featureDir);
    if (!fs.existsSync(featureDir)) continue;
    const trace = lib.buildTrace(featureDir, { repoRoot, allowGaps: true });
    for (const row of trace.rows) {
      for (const t of row.tests || []) files.add(t);
    }
    for (const task of info.tasks) {
      const m = task.description.match(/([\w./-]+\.(?:test|spec)\.[a-z]+)/i);
      if (m) files.add(m[1].split(path.sep).join('/'));
    }
  }
  return Array.from(files);
}

/**
 * Run full verification for the current session batch.
 */
function verify(options = {}) {
  const repoRoot = lib.findRepoRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const batch = accumulator.readBatch();

  if (!batch.files || batch.files.length === 0) {
    return { skipped: true, reason: 'no governed implementation edits this session' };
  }

  const constitutionsByPath = new Map();
  const allConstitutions = [];
  for (const rel of batch.files) {
    const resolved = constitution.resolveConstitutions(repoRoot, path.join(repoRoot, rel));
    for (const c of resolved.applicable) {
      if (!constitutionsByPath.has(c.path)) {
        constitutionsByPath.set(c.path, c);
        allConstitutions.push(c);
      }
    }
  }

  const featureSummaries = {};
  for (const [fid, info] of Object.entries(batch.features)) {
    const featureDir = path.join(repoRoot, info.featureDir);
    featureSummaries[fid] = {
      tasks: info.tasks,
      specExcerpt: (lib.readFileSafe(path.join(featureDir, 'spec.md')) || '').slice(0, 1500),
      designExcerpt: (lib.readFileSafe(path.join(featureDir, 'design.md')) || '').slice(0, 1500)
    };
  }

  const testFiles = collectTestFiles(repoRoot, batch);
  const tests = runTests(repoRoot, testFiles, options);

  const useCodex = options.codex !== false &&
    String(process.env.ECC_SPEC_VERIFY_CODEX || '1') !== '0';
  const codex = useCodex
    ? runCodexReview(repoRoot, buildCodexTask(repoRoot, batch, allConstitutions, featureSummaries), {
      ...options,
      codex: true
    })
    : { ok: true, skipped: true, reason: 'codex skipped' };

  const constitutionOk = allConstitutions.length > 0 || batch.files.length === 0;
  const verdict = {
    session: sessionId(),
    at: new Date().toISOString(),
    files: batch.files,
    features: Object.keys(batch.features),
    constitutions: allConstitutions.map(c => ({ layer: c.layer, path: c.path })),
    tests,
    codex,
    pass: constitutionOk && tests.ok !== false && codex.ok !== false
  };

  // Persist on each feature state
  for (const [fid, info] of Object.entries(batch.features)) {
    const featureDir = path.join(repoRoot, info.featureDir);
    const state = lib.readState(featureDir) || lib.defaultState(fid);
    const gate = { ...(state.gate || {}), implementationVerify: verdict.pass ? 'pass' : 'fail' };
    lib.writeState(featureDir, {
      ...state,
      gate,
      lastVerification: verdict
    });
  }

  return verdict;
}

function formatReport(verdict) {
  if (verdict.skipped) return '';

  const lines = [];
  lines.push('## Spec Implementation Verification (independent)');
  lines.push('');
  lines.push(`**Verdict**: ${verdict.pass ? 'PASS' : 'FAIL — address before continuing'}`);
  lines.push(`**Files**: ${verdict.files.join(', ')}`);
  lines.push(`**Features**: ${verdict.features.join(', ')}`);
  lines.push('');
  lines.push('### Constitutions checked');
  for (const c of verdict.constitutions) {
    lines.push(`- [${c.layer}] \`${c.path}\``);
  }
  lines.push('');
  lines.push('### Tests');
  if (verdict.tests.skipped) {
    lines.push(`- Skipped: ${verdict.tests.reason}`);
  } else {
    lines.push(`- ${verdict.tests.ok ? 'PASS' : 'FAIL'}: \`${verdict.tests.command || 'n/a'}\``);
    if (!verdict.tests.ok && verdict.tests.stderr) {
      lines.push('```');
      lines.push(verdict.tests.stderr.slice(0, 800));
      lines.push('```');
    }
  }
  lines.push('');
  lines.push('### Codex review gate');
  if (verdict.codex.skipped) {
    lines.push(`- Skipped: ${verdict.codex.reason}`);
  } else {
    lines.push(`- ${verdict.codex.ok ? 'PASS' : 'BLOCKERS'}${verdict.codex.sessionId ? ` (SESSION_ID: ${verdict.codex.sessionId})` : ''}`);
    if (!verdict.codex.ok && verdict.codex.output) {
      lines.push(verdict.codex.output.slice(0, 1500));
    }
  }
  lines.push('');
  lines.push('Re-run slice or fix findings before marking tasks done. Disable with `ECC_SPEC_VERIFY=off`.');
  return lines.join('\n');
}

function clearBatch() {
  try {
    fs.unlinkSync(accumulator.batchFile());
  } catch (_) { /* ignore */ }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verdict = verify(args);
  if (args.json) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  } else if (!verdict.skipped) {
    process.stdout.write(formatReport(verdict) + '\n');
  } else {
    process.stdout.write(`${verdict.reason}\n`);
  }
  process.exit(verdict.skipped ? 0 : (verdict.pass ? 0 : 1));
}

if (require.main === module) {
  main();
}

module.exports = { verify, formatReport, runTests, clearBatch };
