/**
 * Tests for scripts/spec-kit/constitution.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../../scripts/spec-kit/lib');
const constitution = require('../../scripts/spec-kit/constitution');

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

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'constitution-test-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

console.log('\nconstitution.js tests\n');

test('resolveConstitutions finds repo layer', () => {
  const repo = tmpRepo();
  lib.ensureDir(path.join(repo, '.specify', 'memory'));
  fs.writeFileSync(path.join(repo, '.specify', 'memory', 'constitution.md'), '# Repo rules');
  const res = constitution.resolveConstitutions(repo, repo);
  assert.ok(res.applicable.some(c => c.layer === 'repo'));
});

test('resolveConstitutions finds path-scoped CONSTITUTION.md', () => {
  const repo = tmpRepo();
  const sub = path.join(repo, 'src', 'api');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'CONSTITUTION.md'), '# API rules');
  const target = path.join(sub, 'handler.ts');
  fs.writeFileSync(target, 'export {}');
  const res = constitution.resolveConstitutions(repo, target);
  assert.ok(res.pathScoped.some(c => c.path.includes('src/api/CONSTITUTION.md')));
});

test('scaffold technical creates technical-constitution.md', () => {
  const repo = tmpRepo();
  const res = constitution.scaffold('technical', { repoRoot: repo });
  assert.ok(fs.existsSync(res.path));
  assert.ok(res.path.includes('technical-constitution.md'));
});

test('scaffold path creates CONSTITUTION.md in dir', () => {
  const repo = tmpRepo();
  const sub = path.join(repo, 'packages', 'core');
  const res = constitution.scaffold('path', { repoRoot: repo, dir: sub });
  assert.ok(fs.existsSync(path.join(sub, 'CONSTITUTION.md')));
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
