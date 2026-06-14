/**
 * Tests for scripts/dispatch/session-registry.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const registry = require('../../scripts/dispatch/session-registry');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed += 1;
  }
}

const origRegistry = registry.REGISTRY_FILE;
let tmpRegistry;

function setup() {
  tmpRegistry = path.join(os.tmpdir(), `session-reg-${Date.now()}.json`);
  registry.REGISTRY_FILE = tmpRegistry;
  fs.writeFileSync(tmpRegistry, JSON.stringify({ version: 1, sessions: [] }));
}

function teardown() {
  registry.REGISTRY_FILE = origRegistry;
  try { fs.unlinkSync(tmpRegistry); } catch (_) { /* ignore */ }
}

console.log('\nsession-registry tests\n');

test('register and getResume round-trip', () => {
  setup();
  registry.register({
    harness: 'codex',
    backend: 'codex',
    sessionId: 'sess-abc',
    featureId: '001-auth',
    role: 'reviewer',
    cwd: '/tmp'
  });
  const row = registry.getResume({ harness: 'codex', featureId: '001-auth', role: 'reviewer' });
  assert.strictEqual(row.sessionId, 'sess-abc');
  teardown();
});

test('listForFeature filters by feature id', () => {
  setup();
  registry.register({ harness: 'gemini', backend: 'gemini', sessionId: 'g1', featureId: '002-ui', role: 'frontend' });
  registry.register({ harness: 'codex', backend: 'codex', sessionId: 'c1', featureId: '001-auth', role: 'reviewer' });
  const rows = registry.listForFeature('002-ui');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].sessionId, 'g1');
  teardown();
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
