/**
 * Tests for scripts/hooks/workflow-context.js (SessionStart context injection)
 *
 * Run with: node tests/hooks/workflow-context.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const hookScript = path.join(repoRoot, 'scripts', 'hooks', 'workflow-context.js');
const { run } = require(hookScript);
const workflowState = require(path.join(repoRoot, 'scripts', 'lib', 'workflow-state'));

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

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-context-test-'));
}

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

console.log('\nworkflow-context.js hook tests\n');

test('run returns empty stdout when the project has no workflows', () => {
  const cwd = makeTempProject();
  withEnv({ ECC_WORKFLOWS_DIR: undefined, ECC_WORKFLOW_CONTEXT: undefined }, () => {
    const output = run(JSON.stringify({ cwd }));
    assert.strictEqual(output.stdout, '');
  });
});

test('run injects a summary of active workflows for the session cwd', () => {
  const cwd = makeTempProject();
  const workflow = workflowState.createWorkflow('hook feature', { cwd });
  workflowState.addMemory(workflow.id, 'remember the budget', { cwd });

  withEnv({ ECC_WORKFLOWS_DIR: undefined, ECC_WORKFLOW_CONTEXT: undefined }, () => {
    const output = run(JSON.stringify({ cwd }));
    assert.ok(output.stdout.includes('Active ECC workflows'));
    assert.ok(output.stdout.includes('hook feature'));
    assert.ok(output.stdout.includes(workflow.id));
    assert.ok(output.stdout.includes('remember the budget'));
  });
});

test('run tolerates non-JSON stdin without throwing', () => {
  withEnv({ ECC_WORKFLOWS_DIR: makeTempProject(), ECC_WORKFLOW_CONTEXT: undefined }, () => {
    const output = run('not json');
    assert.strictEqual(output.stdout, '');
  });
});

test('ECC_WORKFLOW_CONTEXT=off and max-chars=0 disable injection', () => {
  const cwd = makeTempProject();
  workflowState.createWorkflow('disabled feature', { cwd });

  withEnv({ ECC_WORKFLOW_CONTEXT: 'off', ECC_WORKFLOWS_DIR: undefined }, () => {
    assert.strictEqual(run(JSON.stringify({ cwd })).stdout, '');
  });
  withEnv({ ECC_WORKFLOW_CONTEXT_MAX_CHARS: '0', ECC_WORKFLOWS_DIR: undefined }, () => {
    assert.strictEqual(run(JSON.stringify({ cwd })).stdout, '');
  });
});

test('ECC_WORKFLOW_CONTEXT_MAX_CHARS bounds the injected summary', () => {
  const cwd = makeTempProject();
  workflowState.createWorkflow('a feature with a fairly long descriptive name', { cwd });

  withEnv({ ECC_WORKFLOW_CONTEXT_MAX_CHARS: '80', ECC_WORKFLOWS_DIR: undefined, ECC_WORKFLOW_CONTEXT: undefined }, () => {
    const output = run(JSON.stringify({ cwd }));
    assert.ok(output.stdout.length <= 80);
    assert.ok(output.stdout.includes('[truncated]'));
  });
});

test('hook runs standalone via stdin and exits 0 (integration)', () => {
  const cwd = makeTempProject();
  const workflow = workflowState.createWorkflow('spawned feature', { cwd });

  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify({ cwd, hook_event_name: 'SessionStart' }),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, ECC_WORKFLOWS_DIR: '', ECC_WORKFLOW_CONTEXT: '' }
  });

  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes(workflow.id));
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
