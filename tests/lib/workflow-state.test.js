/**
 * Tests for scripts/lib/workflow-state.js
 *
 * Run with: node tests/lib/workflow-state.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workflowState = require('../../scripts/lib/workflow-state');

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

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-state-test-'));
}

console.log('\nworkflow-state.js tests\n');

test('createWorkflow creates state.json and memory.md with first phase active', () => {
  const dir = makeTempDir();
  const workflow = workflowState.createWorkflow('Dark Mode Toggle', { dir });

  assert.ok(workflow.id.startsWith('wf-'), 'id has wf- prefix');
  assert.ok(workflow.id.includes('dark-mode-toggle'), 'id includes slug');
  assert.strictEqual(workflow.status, 'active');
  assert.strictEqual(workflow.phases.length, workflowState.PHASES.length);
  assert.strictEqual(workflow.phases[0].status, 'active');
  assert.strictEqual(workflow.phases[1].status, 'pending');
  assert.ok(fs.existsSync(path.join(dir, workflow.id, 'state.json')));
  assert.ok(fs.existsSync(path.join(dir, workflow.id, 'memory.md')));
});

test('createWorkflow rejects empty names', () => {
  const dir = makeTempDir();
  assert.throws(() => workflowState.createWorkflow('   ', { dir }), /name is required/);
});

test('createWorkflow with design:false marks the design phase skipped', () => {
  const dir = makeTempDir();
  const workflow = workflowState.createWorkflow('rate limiting', { dir, design: false });
  const design = workflow.phases.find(phase => phase.id === 'design');
  assert.strictEqual(design.status, 'skipped');
});

test('createWorkflow avoids id collisions for same name on same day', () => {
  const dir = makeTempDir();
  const first = workflowState.createWorkflow('same name', { dir });
  const second = workflowState.createWorkflow('same name', { dir });
  assert.notStrictEqual(first.id, second.id);
});

test('listWorkflows returns active workflows newest-first and respects all flag', () => {
  const dir = makeTempDir();
  const first = workflowState.createWorkflow('feature one', { dir });
  workflowState.createWorkflow('feature two', { dir });

  let listed = workflowState.listWorkflows({ dir });
  assert.strictEqual(listed.length, 2);

  const workflow = workflowState.getWorkflow(first.id, { dir });
  workflow.status = 'done';
  workflowState.saveWorkflow(workflow, { dir });

  listed = workflowState.listWorkflows({ dir });
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0].name, 'feature two');

  listed = workflowState.listWorkflows({ dir, all: true });
  assert.strictEqual(listed.length, 2);
});

test('updatePhase records status, agents, artifacts, and notes', () => {
  const dir = makeTempDir();
  const created = workflowState.createWorkflow('update phase', { dir });
  const updated = workflowState.updatePhase(created.id, 'implement', {
    status: 'active',
    agent: 'tdd-guide',
    agents: ['build-error-resolver', 'tdd-guide'],
    artifact: 'src/feature.js',
    note: 'starting implementation'
  }, { dir });

  const phase = updated.phases.find(entry => entry.id === 'implement');
  assert.strictEqual(phase.status, 'active');
  assert.ok(phase.startedAt, 'startedAt set when activated');
  assert.deepStrictEqual(phase.agents, ['tdd-guide', 'build-error-resolver']);
  assert.deepStrictEqual(phase.artifacts, ['src/feature.js']);
  assert.deepStrictEqual(phase.notes, ['starting implementation']);
});

test('updatePhase rejects unknown phases and invalid statuses', () => {
  const dir = makeTempDir();
  const created = workflowState.createWorkflow('bad updates', { dir });
  assert.throws(() => workflowState.updatePhase(created.id, 'nope', {}, { dir }), /Unknown phase/);
  assert.throws(() => workflowState.updatePhase(created.id, 'prd', { status: 'bogus' }, { dir }), /Invalid phase status/);
});

test('advanceWorkflow completes the current phase, activates the next, and records memory', () => {
  const dir = makeTempDir();
  const created = workflowState.createWorkflow('advance me', { dir });
  const advanced = workflowState.advanceWorkflow(created.id, { dir, note: 'requirements agreed' });

  assert.strictEqual(advanced.phases[0].status, 'done');
  assert.ok(advanced.phases[0].completedAt);
  assert.strictEqual(advanced.phases[1].status, 'active');
  assert.strictEqual(advanced.memory.length, 1);
  assert.ok(advanced.memory[0].note.includes('requirements agreed'));

  const memoryLog = fs.readFileSync(path.join(dir, created.id, 'memory.md'), 'utf8');
  assert.ok(memoryLog.includes('requirements agreed'));
});

test('advanceWorkflow skips skipped phases and finishes the workflow at the end', () => {
  const dir = makeTempDir();
  const created = workflowState.createWorkflow('full run', { dir, design: false });

  let workflow = created;
  for (let step = 0; step < workflowState.PHASES.length - 1; step += 1) {
    workflow = workflowState.advanceWorkflow(created.id, {
      dir,
      approve: true,
      note: "User approved: 'ship it'"
    });
  }

  assert.strictEqual(workflow.status, 'done');
  const design = workflow.phases.find(phase => phase.id === 'design');
  assert.strictEqual(design.status, 'skipped');
  const others = workflow.phases.filter(phase => phase.id !== 'design');
  assert.ok(others.every(phase => phase.status === 'done'));
  assert.throws(() => workflowState.advanceWorkflow(created.id, { dir }), /no remaining phases/);
});

test('gate phases deny advance without --approve, then allow with approval evidence', () => {
  const dir = makeTempDir();
  const created = workflowState.createWorkflow('gated feature', { dir });

  // Walk to the prd gate phase (requirements -> discovery -> prd)
  workflowState.advanceWorkflow(created.id, { dir });
  workflowState.advanceWorkflow(created.id, { dir });
  assert.strictEqual(workflowState.currentPhase(workflowState.getWorkflow(created.id, { dir })).id, 'prd');

  // DENY: no approval
  assert.throws(
    () => workflowState.advanceWorkflow(created.id, { dir }),
    /GATE: phase "prd" requires explicit approval/
  );
  // FORCE: approval without evidence note is still denied
  assert.throws(
    () => workflowState.advanceWorkflow(created.id, { dir, approve: true }),
    /requires --note quoting the user's approval verbatim/
  );
  // ALLOW: approval with verbatim evidence passes
  const advanced = workflowState.advanceWorkflow(created.id, {
    dir,
    approve: true,
    note: "User approved: 'PRD looks good, proceed'"
  });
  assert.strictEqual(advanced.phases.find(phase => phase.id === 'prd').status, 'done');
  assert.ok(advanced.memory.some(entry => entry.note.includes('PRD looks good')));

  // Non-gate phases still advance without approval
  const next = workflowState.advanceWorkflow(created.id, { dir });
  assert.strictEqual(next.phases.find(phase => phase.id === 'tech-plan').status, 'done');
});

test('addMemory appends to state and memory.md with optional phase tag', () => {
  const dir = makeTempDir();
  const created = workflowState.createWorkflow('memory test', { dir });
  workflowState.addMemory(created.id, 'budget caps third-party providers', { dir, phase: 'requirements' });

  const workflow = workflowState.getWorkflow(created.id, { dir });
  assert.strictEqual(workflow.memory.length, 1);
  assert.strictEqual(workflow.memory[0].phase, 'requirements');

  const memoryLog = fs.readFileSync(path.join(dir, created.id, 'memory.md'), 'utf8');
  assert.ok(memoryLog.includes('[requirements] budget caps third-party providers'));

  assert.throws(() => workflowState.addMemory(created.id, '  ', { dir }), /note is required/);
});

test('summarizeWorkflows is empty without workflows and bounded with them', () => {
  const dir = makeTempDir();
  assert.strictEqual(workflowState.summarizeWorkflows({ dir }), '');

  const created = workflowState.createWorkflow('summary feature', { dir });
  workflowState.addMemory(created.id, 'a note', { dir });

  const summary = workflowState.summarizeWorkflows({ dir });
  assert.ok(summary.includes('summary feature'));
  assert.ok(summary.includes(created.id));
  assert.ok(summary.includes('a note'));

  const bounded = workflowState.summarizeWorkflows({ dir, maxChars: 60 });
  assert.ok(bounded.length <= 60);
  assert.ok(bounded.includes('[truncated]'));
});

test('getWorkflow returns null for missing workflows', () => {
  const dir = makeTempDir();
  assert.strictEqual(workflowState.getWorkflow('wf-00000000-missing', { dir }), null);
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
