/**
 * Tests for scripts/lib/workflow-dispatch.js
 *
 * Run with: node tests/lib/workflow-dispatch.test.js
 *
 * Dispatch tests stay dry-run (no tmux/git worktree side effects); ingest
 * tests fabricate a coordination directory with worker status/handoff files.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workflowState = require('../../scripts/lib/workflow-state');
const workflowDispatch = require('../../scripts/lib/workflow-dispatch');

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

function makeTempDir(prefix = 'workflow-dispatch-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

console.log('\nworkflow-dispatch.js tests\n');

test('buildPhaseTaskText embeds objective, memory tail, and the GateGuard protocol', () => {
  const dir = makeTempDir();
  const workflow = workflowState.createWorkflow('task text feature', { dir, description: 'why we build it' });
  workflowState.addMemory(workflow.id, 'budget caps providers', { dir, phase: 'requirements' });
  workflowState.updatePhase(workflow.id, 'requirements', { artifact: 'docs/notes.md', note: 'a phase note' }, { dir });

  const refreshed = workflowState.getWorkflow(workflow.id, { dir });
  const phase = refreshed.phases.find(entry => entry.id === 'requirements');
  const text = workflowDispatch.buildPhaseTaskText(refreshed, phase, { dir });

  assert.ok(text.includes(`Workflow: task text feature [${workflow.id}]`));
  assert.ok(text.includes('why we build it'));
  assert.ok(text.includes('## Phase objective'));
  assert.ok(text.includes('a phase note'));
  assert.ok(text.includes('docs/notes.md'));
  assert.ok(text.includes('budget caps providers'));
  assert.ok(text.includes('## GateGuard protocol (fact-forcing gates)'));
  assert.ok(text.includes('Never disable or bypass the gate'));
  assert.ok(text.includes(`memory ${workflow.id} --phase requirements`));
  assert.ok(text.includes(`--dir ${dir}`), 'report-back command carries the resolved workflows dir');
});

test('buildDispatchConfig resolves harness launcher templates per worker', () => {
  const dir = makeTempDir();
  const workflow = workflowState.createWorkflow('config feature', { dir });
  const phase = workflow.phases[0];

  const config = workflowDispatch.buildDispatchConfig(workflow, phase, {
    dir,
    harnesses: ['codex', 'cursor'],
    repoRoot: '/tmp/some-repo'
  });

  assert.strictEqual(config.sessionName, `${workflow.id}-requirements`);
  assert.strictEqual(config.workers.length, 2);
  assert.strictEqual(config.workers[0].name, 'requirements-codex');
  assert.ok(config.workers[0].launcherCommand.includes('orchestrate-codex-worker.sh'));
  assert.ok(config.workers[1].launcherCommand.startsWith('cursor-agent'));
});

test('explicit --launcher template overrides the harness default', () => {
  const dir = makeTempDir();
  const workflow = workflowState.createWorkflow('launcher override', { dir });
  const config = workflowDispatch.buildDispatchConfig(workflow, workflow.phases[0], {
    dir,
    harnesses: ['gemini'],
    launcher: 'my-cli --task {task_file_sh}'
  });
  assert.strictEqual(config.workers[0].launcherCommand, 'my-cli --task {task_file_sh}');
});

test('unknown harness names are rejected with the known list', () => {
  const dir = makeTempDir();
  const workflow = workflowState.createWorkflow('bad harness', { dir });
  assert.throws(
    () => workflowDispatch.buildDispatchConfig(workflow, workflow.phases[0], { dir, harnesses: ['ruflo'] }),
    /Unknown harness "ruflo".*claude.*codex/
  );
});

test('dispatchPhase dry-run builds a plan and records agents, dispatches, and memory without executing', () => {
  const dir = makeTempDir();
  const repoRoot = makeTempDir('workflow-dispatch-repo-');
  const workflow = workflowState.createWorkflow('dry run feature', { dir });

  const { plan, executed } = workflowDispatch.dispatchPhase(workflow.id, {
    dir,
    repoRoot,
    harnesses: ['codex', 'gemini']
  });

  assert.strictEqual(executed, false);
  assert.strictEqual(plan.workerPlans.length, 2);
  assert.ok(plan.workerPlans[0].task.includes('GateGuard protocol'));
  // Dry-run must not create worktrees or coordination files
  assert.ok(!fs.existsSync(plan.coordinationDir));
  assert.ok(!fs.existsSync(plan.workerPlans[0].worktreePath));

  const refreshed = workflowState.getWorkflow(workflow.id, { dir });
  const phase = refreshed.phases.find(entry => entry.id === 'requirements');
  assert.ok(phase.agents.includes('codex-worker'));
  assert.ok(phase.agents.includes('gemini-worker'));
  assert.strictEqual(refreshed.dispatches.length, 1);
  assert.strictEqual(refreshed.dispatches[0].executed, false);
  assert.deepStrictEqual(refreshed.dispatches[0].harnesses, ['codex', 'gemini']);
  assert.ok(refreshed.memory.some(entry => entry.note.includes('Planned dispatch of codex, gemini')));
});

test('dispatchPhase targets a named phase and defaults to the current one', () => {
  const dir = makeTempDir();
  const repoRoot = makeTempDir('workflow-dispatch-repo-');
  const workflow = workflowState.createWorkflow('phase targeting', { dir });

  const named = workflowDispatch.dispatchPhase(workflow.id, { dir, repoRoot, phase: 'implement' });
  assert.strictEqual(named.plan.sessionName, `${workflow.id}-implement`);

  const current = workflowDispatch.dispatchPhase(workflow.id, { dir, repoRoot, replace: true });
  assert.strictEqual(current.plan.sessionName, `${workflow.id}-requirements`);

  // Re-dispatching the same phase upserts the record instead of duplicating it
  workflowDispatch.dispatchPhase(workflow.id, { dir, repoRoot, phase: 'implement' });
  const refreshed = workflowState.getWorkflow(workflow.id, { dir });
  const implementDispatches = refreshed.dispatches.filter(entry => entry.phase === 'implement');
  assert.strictEqual(implementDispatches.length, 1);

  assert.throws(
    () => workflowDispatch.dispatchPhase(workflow.id, { dir, repoRoot, phase: 'nope' }),
    /Unknown phase "nope"/
  );
  assert.throws(
    () => workflowDispatch.dispatchPhase('wf-00000000-missing', { dir, repoRoot }),
    /Workflow not found/
  );
});

test('ingestDispatch reads worker handoffs into memory and phase artifacts', () => {
  const dir = makeTempDir();
  const repoRoot = makeTempDir('workflow-dispatch-repo-');
  const workflow = workflowState.createWorkflow('ingest feature', { dir });

  const { plan } = workflowDispatch.dispatchPhase(workflow.id, { dir, repoRoot, harnesses: ['codex'] });

  // Fabricate what an executed worker would leave behind
  const workerDir = plan.workerPlans[0].coordinationDir;
  fs.mkdirSync(workerDir, { recursive: true });
  fs.writeFileSync(
    plan.workerPlans[0].statusFilePath,
    '# Status\n\n- State: completed\n- Branch: `feature-x`\n'
  );
  fs.writeFileSync(
    plan.workerPlans[0].handoffFilePath,
    '# Handoff\n\n## Summary\n- Implemented the feature\n- All checks green\n\n## Validation\n- node tests pass\n'
  );

  const ingested = workflowDispatch.ingestDispatch(workflow.id, { dir });
  assert.strictEqual(ingested.length, 1);
  assert.strictEqual(ingested[0].state, 'completed');
  assert.deepStrictEqual(ingested[0].summary, ['Implemented the feature', 'All checks green']);

  const refreshed = workflowState.getWorkflow(workflow.id, { dir });
  assert.ok(refreshed.memory.some(entry => entry.note.includes('state: completed') && entry.note.includes('Implemented the feature')));
  const phase = refreshed.phases.find(entry => entry.id === 'requirements');
  assert.ok(phase.artifacts.includes(plan.workerPlans[0].handoffFilePath));
});

test('ingestDispatch validates session names and requires recorded dispatches', () => {
  const dir = makeTempDir();
  const repoRoot = makeTempDir('workflow-dispatch-repo-');
  const workflow = workflowState.createWorkflow('ingest errors', { dir });

  assert.throws(() => workflowDispatch.ingestDispatch(workflow.id, { dir }), /no recorded dispatches/);

  workflowDispatch.dispatchPhase(workflow.id, { dir, repoRoot });
  assert.throws(
    () => workflowDispatch.ingestDispatch(workflow.id, { dir, session: 'does-not-exist' }),
    /No dispatch found for session/
  );
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
