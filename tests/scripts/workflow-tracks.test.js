/**
 * Tests for the /ecc:workflow spec track unification.
 *
 * Covers track-aware state (scripts/lib/workflow-state.js) and the CLI wiring
 * (scripts/workflow.js) that scaffolds/links a spec feature and mirrors the
 * current phase into specs/<id>/.state.json without touching guard-critical
 * fields (active, gate.confirm).
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ws = require('../../scripts/lib/workflow-state');
const specLib = require('../../scripts/spec-kit/lib');

const WORKFLOW_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'workflow.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  FAIL ${name}`);
    console.log(`    Error: ${error.message}`);
    failed += 1;
  }
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-track-'));
  fs.mkdirSync(path.join(repo, '.git'));
  return repo;
}

function runCli(repo, args) {
  const env = { ...process.env, ECC_WORKFLOWS_DIR: path.join(repo, '.claude', 'workflows') };
  const result = cp.spawnSync('node', [WORKFLOW_CLI, ...args], { cwd: repo, env, encoding: 'utf8' });
  return result;
}

console.log('\nworkflow spec-track tests\n');

test('createWorkflow spec track builds the 11 spec phases and persists pointer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-state-'));
  const w = ws.createWorkflow('Auth', {
    dir,
    track: 'spec',
    spec: { featureId: '001-auth', featureDir: path.join(dir, '001-auth') }
  });
  assert.strictEqual(w.track, 'spec');
  assert.strictEqual(w.phases.length, ws.SPEC_PHASES.length);
  assert.strictEqual(w.phases[0].id, 'research');
  assert.ok(w.phases.find(p => p.id === 'confirm').gate, 'confirm is a gate');
  assert.strictEqual(w.spec.featureId, '001-auth');
});

test('default track stays prd with the eight prd phases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-state-'));
  const w = ws.createWorkflow('Plain', { dir });
  assert.strictEqual(w.track, 'prd');
  assert.strictEqual(w.phases.length, ws.PHASES.length);
  assert.ok(!w.spec);
});

test('CLI start --track spec scaffolds specs/<id>/ and links it', () => {
  const repo = makeRepo();
  const r = runCli(repo, ['start', 'user auth', '--track', 'spec', '--description', 'OAuth login', '--json']);
  assert.strictEqual(r.status, 0, r.stderr);
  const w = JSON.parse(r.stdout);
  assert.strictEqual(w.track, 'spec');
  assert.ok(w.spec.featureId.endsWith('-user-auth'));
  assert.ok(fs.existsSync(path.join(repo, 'specs', w.spec.featureId, 'spec.md')));
  assert.ok(fs.existsSync(path.join(repo, 'specs', w.spec.featureId, '.state.json')));
});

test('CLI start --feature links an existing feature without duplicating', () => {
  const repo = makeRepo();
  const created = specLib.createFeature('OAuth login', { repoRoot: repo, shortName: 'user auth' });
  const r = runCli(repo, ['start', 'user auth', '--track', 'spec', '--feature', created.featureId, '--json']);
  assert.strictEqual(r.status, 0, r.stderr);
  const w = JSON.parse(r.stdout);
  assert.strictEqual(w.spec.featureId, created.featureId);
  const dirs = fs.readdirSync(path.join(repo, 'specs'));
  assert.strictEqual(dirs.length, 1, 'no duplicate feature dir');
});

test('CLI advance mirrors phase into .state.json but leaves active/gate untouched', () => {
  const repo = makeRepo();
  const start = JSON.parse(runCli(repo, ['start', 'billing', '--track', 'spec', '--description', 'invoices', '--json']).stdout);
  const featureDir = path.join(repo, 'specs', start.spec.featureId);

  const before = specLib.readState(featureDir);
  assert.strictEqual(before.active, false);
  assert.strictEqual(before.gate.confirm, 'pending');

  const adv = runCli(repo, ['advance', start.id]);
  assert.strictEqual(adv.status, 0, adv.stderr);

  const after = specLib.readState(featureDir);
  assert.strictEqual(after.phase, 'constitution', 'phase mirrored to second spec phase');
  assert.strictEqual(after.active, false, 'active not flipped by advance');
  assert.strictEqual(after.gate.confirm, 'pending', 'gate.confirm not flipped by advance');
});

test('summarizeWorkflows surfaces the spec feature, live phase, gate state, and GateGuard reminder', () => {
  const repo = makeRepo();
  const dir = path.join(repo, '.claude', 'workflows');
  const created = specLib.createFeature('search', { repoRoot: repo, shortName: 'search' });
  ws.createWorkflow('search', {
    dir,
    track: 'spec',
    spec: { featureId: created.featureId, featureDir: created.featureDir }
  });

  const summary = ws.summarizeWorkflows({ dir });
  assert.ok(summary.includes('[spec]'), 'tags the spec track');
  assert.ok(summary.includes(created.featureId), 'names the feature');
  assert.ok(/gate:\s*unapproved/.test(summary), 'shows unapproved gate state');
  assert.ok(summary.includes('GateGuard'), 'includes the persistent GateGuard reminder');
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
