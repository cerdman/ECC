/**
 * Tests for spec implementation verify (accumulator + verify-implementation)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../../scripts/spec-kit/lib');
const accumulator = require('../../scripts/hooks/spec-implementation-accumulator');
const verifyImpl = require('../../scripts/spec-kit/verify-implementation');

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

function makeFeatureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-test-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, '.specify', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specify', 'memory', 'constitution.md'), '# rules');
  const fd = path.join(root, 'specs', '001-feat');
  fs.mkdirSync(fd, { recursive: true });
  fs.writeFileSync(path.join(fd, 'spec.md'), '- **FR-001**: x');
  fs.writeFileSync(path.join(fd, 'design.md'), '- **DES-001** (FR-001): y');
  fs.writeFileSync(path.join(fd, 'tasks.md'), '- [ ] T010 [US1] [FR-001] Build svc in src/svc.ts');
  lib.writeState(fd, {
    ...lib.defaultState('001-feat'),
    active: true,
    gate: { confirm: 'approved' }
  });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  return { root, fd };
}

console.log('\nverify-implementation tests\n');

test('accumulator records governed file under approved feature', () => {
  const { root } = makeFeatureRepo();
  const target = path.join(root, 'src', 'svc.ts');
  fs.writeFileSync(target, 'export const x = 1;');
  const batch = { session: 't', files: [], features: {} };
  accumulator.recordFile(batch, root, target);
  assert.ok(batch.files.some(f => f.includes('src/svc.ts')));
  assert.ok(batch.features['001-feat']);
});

test('verify skips when batch is empty', () => {
  const orig = accumulator.batchFile();
  const tmp = path.join(os.tmpdir(), `empty-batch-${Date.now()}.json`);
  const origRead = accumulator.readBatch;
  accumulator.readBatch = () => ({ files: [], features: {} });
  const verdict = verifyImpl.verify({ codex: false, dryRun: true });
  assert.strictEqual(verdict.skipped, true);
  accumulator.readBatch = origRead;
});

test('verify dry-run produces verdict with constitutions', () => {
  const { root } = makeFeatureRepo();
  const origRead = accumulator.readBatch;
  const origCwd = process.cwd();
  try {
    process.chdir(root);
    process.env.CLAUDE_PROJECT_DIR = root;
    accumulator.readBatch = () => ({
      session: 't',
      files: ['src/svc.ts'],
      features: {
        '001-feat': {
          featureDir: 'specs/001-feat',
          tasks: [{ id: 'T010', done: false, description: 'Build svc in src/svc.ts' }]
        }
      }
    });
    const verdict = verifyImpl.verify({ codex: false, dryRun: true });
    assert.ok(verdict.constitutions.length >= 1, 'expected repo constitution');
  } finally {
    accumulator.readBatch = origRead;
    process.chdir(origCwd);
    delete process.env.CLAUDE_PROJECT_DIR;
  }
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
