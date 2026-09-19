/**
 * Tests for scripts/ci/check-hooks-schema-keys.js.
 *
 * Run with: node tests/ci/check-hooks-schema-keys.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ci', 'check-hooks-schema-keys.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function runScript(rootDir) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOOKS_FILE: path.join(rootDir, 'hooks', 'hooks.json'),
      CODEX_HOOKS_FILE: path.join(rootDir, 'hooks', 'codex-hooks.json'),
    },
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    return true;
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error.message}`);
    return false;
  }
}

let passed = 0;
let failed = 0;

if (test('accepts documented Claude hooks keys and skips missing Codex file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hook-keys-'));
  try {
    writeJson(path.join(root, 'hooks', 'hooks.json'), {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo ok', async: true, timeout: 1 }] }],
      },
    });

    const result = runScript(root);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /Checked 1 hooks config\(s\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})) passed++; else failed++;

if (test('rejects unknown Claude hooks root and matcher keys', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hook-keys-'));
  try {
    writeJson(path.join(root, 'hooks', 'hooks.json'), {
      $schema: 'x',
      hooks: {
        PreToolUse: [{ id: 'pre:x', description: 'x', matcher: 'Bash', hooks: [{ type: 'command', command: 'echo ok' }] }],
      },
    });

    const result = runScript(root);
    assert.strictEqual(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /root key "\$schema"/);
    assert.match(result.stderr, /key "id"/);
    assert.match(result.stderr, /key "description"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})) passed++; else failed++;

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
