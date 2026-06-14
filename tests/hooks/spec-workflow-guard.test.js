/**
 * Tests for scripts/hooks/spec-workflow-guard.js
 *
 * Run with: node tests/hooks/spec-workflow-guard.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const guard = require('../../scripts/hooks/spec-workflow-guard');

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

function makeRepo(stateObj) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, '.specify', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specify', 'memory', 'constitution.md'), '# c');
  const fd = path.join(root, 'specs', '001-x');
  fs.mkdirSync(fd, { recursive: true });
  fs.writeFileSync(path.join(fd, 'spec.md'), '- **FR-001**: x');
  fs.writeFileSync(path.join(fd, 'design.md'), '- **DES-001** (FR-001): y');
  fs.writeFileSync(path.join(fd, 'tasks.md'), '- [ ] T010 [US1] [FR-001,DES-001] Build login in src/login.ts');
  fs.writeFileSync(path.join(fd, '.state.json'), JSON.stringify(stateObj));
  return root;
}

function editInput(file) {
  return JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } });
}

function isDeny(result) {
  return Boolean(result && typeof result === 'object' && result.stdout && /"permissionDecision":"deny"/.test(result.stdout));
}

console.log('\nspec-workflow-guard tests\n');

test('denies an edit to a governed file before approval', () => {
  const root = makeRepo({ feature: '001-x', gate: { confirm: 'pending' } });
  process.env.CLAUDE_PROJECT_DIR = root;
  const result = guard.run(editInput(path.join(root, 'src', 'login.ts')));
  assert.ok(isDeny(result), 'should deny');
  assert.ok(/not yet approved/i.test(result.stdout));
});

test('allows the edit after approval', () => {
  const root = makeRepo({ feature: '001-x', active: true, gate: { confirm: 'approved' } });
  process.env.CLAUDE_PROJECT_DIR = root;
  const raw = editInput(path.join(root, 'src', 'login.ts'));
  const result = guard.run(raw);
  assert.strictEqual(result, raw, 'should pass through (allow)');
});

test('is inert for files not governed by any feature plan', () => {
  const root = makeRepo({ feature: '001-x', gate: { confirm: 'pending' } });
  process.env.CLAUDE_PROJECT_DIR = root;
  const raw = editInput(path.join(root, 'unrelated', 'thing.ts'));
  assert.strictEqual(guard.run(raw), raw);
});

test('always allows edits to the spec docs themselves', () => {
  const root = makeRepo({ feature: '001-x', gate: { confirm: 'pending' } });
  process.env.CLAUDE_PROJECT_DIR = root;
  const raw = editInput(path.join(root, 'specs', '001-x', 'design.md'));
  assert.strictEqual(guard.run(raw), raw);
});

test('respects ECC_SPEC_GUARD=off', () => {
  const root = makeRepo({ feature: '001-x', gate: { confirm: 'pending' } });
  process.env.CLAUDE_PROJECT_DIR = root;
  process.env.ECC_SPEC_GUARD = 'off';
  const raw = editInput(path.join(root, 'src', 'login.ts'));
  try {
    assert.strictEqual(guard.run(raw), raw);
  } finally {
    delete process.env.ECC_SPEC_GUARD;
  }
});

test('bash guard denies a file-mutating command on an unapproved governed path', () => {
  const root = makeRepo({ feature: '001-x', gate: { confirm: 'pending' } });
  process.env.CLAUDE_PROJECT_DIR = root;
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo x > src/login.ts' } });
  assert.ok(isDeny(guard.run(input)), 'should deny mutating command');
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
