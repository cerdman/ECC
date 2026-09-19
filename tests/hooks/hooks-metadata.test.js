/**
 * Tests for the hooks.json / hooks.metadata.json split.
 *
 * Run with: node tests/hooks/hooks-metadata.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  applyHooksMetadata,
  findMetadataMismatches,
  fingerprintHookEntry,
  metadataPathFor,
  readHooksConfig,
  withRefreshedFingerprints,
} = require('../../scripts/lib/hooks-config');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOKS_PATH = path.join(REPO_ROOT, 'hooks', 'hooks.json');
const METADATA_PATH = metadataPathFor(HOOKS_PATH);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function eachMatcher(hooksConfig, visit) {
  for (const [event, entries] of Object.entries(hooksConfig.hooks || {})) {
    (entries || []).forEach((entry, index) => visit(entry, `${event}[${index}]`));
  }
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const alpha = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node alpha.js' }] };
const beta = { matcher: 'Write', hooks: [{ type: 'command', command: 'node beta.js' }] };
const alphaMeta = { id: 'a', fingerprint: fingerprintHookEntry(alpha) };
const betaMeta = { id: 'b', fingerprint: fingerprintHookEntry(beta) };

test('hooks.json does not declare $schema', () => {
  const hooksConfig = readJson(HOOKS_PATH);
  assert.ok(!('$schema' in hooksConfig));
});

test('hooks.json matcher entries carry no id or description', () => {
  const hooksConfig = readJson(HOOKS_PATH);
  eachMatcher(hooksConfig, (entry, label) => {
    assert.ok(!('id' in entry), `${label} must not define "id"`);
    assert.ok(!('description' in entry), `${label} must not define "description"`);
  });
});

test('metadata sidecar exists and lines up with hooks.json', () => {
  assert.ok(fs.existsSync(METADATA_PATH), 'hooks/hooks.metadata.json is missing');
  const mismatches = findMetadataMismatches(readJson(HOOKS_PATH), readJson(METADATA_PATH));
  assert.deepStrictEqual(mismatches, []);
});

test('every matcher entry has a unique id after merging', () => {
  const merged = readHooksConfig(HOOKS_PATH);
  const seen = new Map();

  eachMatcher(merged, (entry, label) => {
    assert.ok(typeof entry.id === 'string' && entry.id.trim() !== '', `${label} missing merged id`);
    assert.ok(!seen.has(entry.id), `duplicate id ${entry.id}`);
    seen.set(entry.id, label);
  });
});

test('applyHooksMetadata returns a new config and leaves inputs untouched', () => {
  const entry = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node a.js' }] };
  const hooksConfig = { hooks: { PreToolUse: [entry] } };
  const metadata = { entries: { PreToolUse: [{ id: 'a', description: 'A' }] } };

  const merged = applyHooksMetadata(hooksConfig, metadata);

  assert.notStrictEqual(merged, hooksConfig);
  assert.notStrictEqual(merged.hooks.PreToolUse[0], entry);
  assert.deepStrictEqual(merged.hooks.PreToolUse[0], { ...entry, id: 'a', description: 'A' });
  assert.deepStrictEqual(hooksConfig, { hooks: { PreToolUse: [entry] } });
});

test('findMetadataMismatches reports alignment, duplicate id, and fingerprint problems', () => {
  const hooksConfig = { hooks: { PreToolUse: [alpha], PostToolUse: [beta] } };
  const mismatches = findMetadataMismatches(hooksConfig, {
    entries: {
      PreToolUse: [alphaMeta],
      PostToolUse: [{ ...betaMeta, id: 'a', fingerprint: '000000000000' }],
      Stop: [],
    },
  });

  assert.ok(mismatches.some(problem => problem.includes('describes event "Stop"')));
  assert.ok(mismatches.some(problem => problem.includes('duplicate id')));
  assert.ok(mismatches.some(problem => problem.includes('fingerprint')));
});

test('fingerprintHookEntry ignores id, description, and key order', () => {
  const base = fingerprintHookEntry(alpha);
  assert.match(base, /^[0-9a-f]{12}$/);
  assert.strictEqual(fingerprintHookEntry({ ...alpha, id: 'x', description: 'y' }), base);
  assert.strictEqual(
    fingerprintHookEntry({ hooks: [{ command: 'node alpha.js', type: 'command' }], matcher: 'Bash' }),
    base
  );
  assert.notStrictEqual(fingerprintHookEntry(beta), base);
});

test('withRefreshedFingerprints rewrites fingerprints and rejects reordered metadata', () => {
  const stale = {
    entries: { PreToolUse: [{ id: 'a', fingerprint: '000000000000' }, { id: 'b' }] },
  };
  const refreshed = withRefreshedFingerprints({ hooks: { PreToolUse: [alpha, beta] } }, stale);
  assert.deepStrictEqual(refreshed.entries.PreToolUse, [alphaMeta, betaMeta]);

  assert.throws(
    () => withRefreshedFingerprints({ hooks: { PreToolUse: [beta, alpha] } }, {
      entries: { PreToolUse: [alphaMeta, betaMeta] },
    }),
    /reorder/i
  );
});

test('readHooksConfig rejects misaligned sidecars and returns raw config without one', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hooks-'));
  const tempHooks = path.join(tempDir, 'hooks.json');

  try {
    fs.writeFileSync(tempHooks, JSON.stringify({ hooks: { PreToolUse: [alpha, beta] } }));
    fs.writeFileSync(
      metadataPathFor(tempHooks),
      JSON.stringify({ entries: { PreToolUse: [betaMeta, alphaMeta] } })
    );
    assert.throws(() => readHooksConfig(tempHooks), /does not line up/);

    fs.rmSync(metadataPathFor(tempHooks));
    assert.deepStrictEqual(readHooksConfig(tempHooks), { hooks: { PreToolUse: [alpha, beta] } });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('failed fingerprint refresh preserves the original sidecar bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hooks-refresh-'));

  try {
    for (const relative of [
      'scripts/ci/validate-hooks.js',
      'scripts/lib/hooks-config.js',
      'schemas/hooks.schema.json',
      'schemas/hooks-metadata.schema.json',
    ]) {
      const destination = path.join(root, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, relative), destination);
    }

    fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [alpha] } }));

    const sidecar = path.join(root, 'hooks', 'hooks.metadata.json');
    const original = JSON.stringify({ entries: { PreToolUse: [{ ...alphaMeta, id: '', fingerprint: '000000000000' }] } });
    fs.writeFileSync(sidecar, original);

    const result = spawnSync(process.execPath, [path.join(root, 'scripts/ci/validate-hooks.js'), '--update-fingerprints'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: path.join(REPO_ROOT, 'node_modules') },
    });

    assert.strictEqual(result.status, 1, result.stderr);
    assert.strictEqual(fs.readFileSync(sidecar, 'utf8'), original);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error.message}`);
  }
}

console.log(`\nResults: Passed: ${tests.length - failures}, Failed: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
