/**
 * Tests for scripts/spec-kit/* (Kiro-style spec-driven workflow).
 *
 * Run with: node tests/scripts/spec-kit.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../../scripts/spec-kit/lib');
const execPlan = require('../../scripts/spec-kit/exec-plan');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-kit-test-'));
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });
  return dir;
}

function writeFeature(repoRoot, id, { spec, design, tasks }) {
  const dir = path.join(repoRoot, 'specs', id);
  fs.mkdirSync(dir, { recursive: true });
  if (spec != null) fs.writeFileSync(path.join(dir, 'spec.md'), spec);
  if (design != null) fs.writeFileSync(path.join(dir, 'design.md'), design);
  if (tasks != null) fs.writeFileSync(path.join(dir, 'tasks.md'), tasks);
  return dir;
}

console.log('\nspec-kit tests\n');

// --- slug / id helpers ---

test('slugify produces a clean slug', () => {
  assert.strictEqual(lib.slugify('Add  User Auth!!'), 'add-user-auth');
  assert.strictEqual(lib.shortName('Implement OAuth2 integration for the API'), 'implement-oauth2-integration-for');
});

test('nextFeatureNumber increments past existing dirs', () => {
  const repo = tmpRepo();
  fs.mkdirSync(path.join(repo, 'specs', '001-foo'));
  fs.mkdirSync(path.join(repo, 'specs', '004-bar'));
  assert.strictEqual(lib.nextFeatureNumber(repo), '005');
});

test('nextFeatureNumber starts at 001 when empty', () => {
  const repo = tmpRepo();
  assert.strictEqual(lib.nextFeatureNumber(repo), '001');
});

// --- feature scaffolding ---

test('createFeature scaffolds dir, spec.md, and .state.json with uid', () => {
  const repo = tmpRepo();
  const res = lib.createFeature('Build a photo album organizer', { repoRoot: repo });
  assert.ok(res.featureId.startsWith('001-'), 'gets number 001');
  assert.ok(fs.existsSync(res.specFile), 'spec.md created');
  const state = lib.readState(res.featureDir);
  assert.ok(state.uid && state.uid.length >= 16, 'state has uid');
  assert.strictEqual(state.active, false, 'starts inactive');
  assert.strictEqual(state.gate.confirm, 'pending');
  const spec = fs.readFileSync(res.specFile, 'utf8');
  assert.ok(spec.includes('Build a photo album organizer'), 'spec embeds description');
});

test('createFeature rejects empty description', () => {
  const repo = tmpRepo();
  assert.throws(() => lib.createFeature('   ', { repoRoot: repo }), /description is required/);
});

// --- parsing ---

test('parseSpec extracts FR, SC, and user stories with priority', () => {
  const spec = [
    '# Feature Specification: Demo',
    '### User Story 1 - Login (Priority: P1)',
    '- **FR-001**: System MUST allow login',
    '- **FR-002**: System MUST validate email',
    '### User Story 2 - Logout (Priority: P2)',
    '- **SC-001**: Login completes in under 2s'
  ].join('\n');
  const parsed = lib.parseSpec(spec);
  assert.deepStrictEqual(parsed.frs, ['FR-001', 'FR-002']);
  assert.deepStrictEqual(parsed.scs, ['SC-001']);
  assert.strictEqual(parsed.stories.length, 2);
  assert.strictEqual(parsed.stories[0].id, 'US1');
  assert.strictEqual(parsed.stories[0].priority, 'P1');
});

test('parseDesign links DES elements to cited requirements', () => {
  const design = [
    '- **DES-001** (FR-001): Auth service',
    '- **DES-002** (FR-002, SC-001): Validation layer'
  ].join('\n');
  const parsed = lib.parseDesign(design);
  assert.strictEqual(parsed.elements.length, 2);
  assert.deepStrictEqual(parsed.elements[0], { id: 'DES-001', refs: ['FR-001'] });
  assert.deepStrictEqual(parsed.elements[1].refs, ['FR-002', 'SC-001']);
});

test('parseTasks reads id, done, story, parallel, and refs', () => {
  const tasks = [
    '- [ ] T001 Setup project',
    '- [x] T012 [P] [US1] [FR-001,DES-001] Create model in src/models/user.ts',
    '- [ ] T013 [US1] [FR-002,DES-002] Implement service'
  ].join('\n');
  const parsed = lib.parseTasks(tasks);
  assert.strictEqual(parsed.tasks.length, 3);
  assert.strictEqual(parsed.tasks[1].done, true);
  assert.strictEqual(parsed.tasks[1].parallel, true);
  assert.strictEqual(parsed.tasks[1].story, 'US1');
  assert.ok(parsed.tasks[1].refs.includes('FR-001'));
  assert.ok(parsed.tasks[1].refs.includes('DES-001'));
  assert.strictEqual(parsed.tasks[0].done, false);
});

// --- trace ---

const FULL_SPEC = [
  '# Feature Specification: Auth',
  '### User Story 1 - Login (Priority: P1)',
  '- **FR-001**: System MUST allow login',
  '- **SC-001**: Login under 2s'
].join('\n');

test('buildTrace marks done when tasks complete and a test references the FR', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '001-auth', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): Auth service',
    tasks: '- [x] T010 [US1] [FR-001,DES-001] Implement login in src/auth.ts'
  });
  const trace = lib.buildTrace(dir, {
    repoRoot: repo,
    testRefs: { 'FR-001': ['tests/auth.test.ts'] }
  });
  const row = trace.rows.find(r => r.requirement === 'FR-001');
  assert.strictEqual(row.status, 'done');
  assert.strictEqual(trace.exitCode, 0);
});

test('buildTrace flags an orphan requirement (no design) with exit 1', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '002-orphan', {
    spec: FULL_SPEC,
    design: '## Design with no elements',
    tasks: '- [ ] T001 Setup'
  });
  const trace = lib.buildTrace(dir, { repoRoot: repo, testRefs: {} });
  const row = trace.rows.find(r => r.requirement === 'FR-001');
  assert.strictEqual(row.status, 'gap: no design');
  assert.strictEqual(trace.exitCode, 1);
  assert.ok(trace.gaps.some(g => g.includes('FR-001')));
});

test('buildTrace allowGaps downgrades exit code to 0', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '003-gap', {
    spec: FULL_SPEC,
    design: '## none',
    tasks: ''
  });
  const trace = lib.buildTrace(dir, { repoRoot: repo, testRefs: {}, allowGaps: true });
  assert.strictEqual(trace.exitCode, 0);
});

test('buildTrace reports in-progress when tasks partially done', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '004-prog', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): svc',
    tasks: [
      '- [x] T010 [US1] [FR-001,DES-001] part a in src/a.ts',
      '- [ ] T011 [US1] [FR-001] part b in src/b.ts'
    ].join('\n')
  });
  const trace = lib.buildTrace(dir, { repoRoot: repo, testRefs: {} });
  const row = trace.rows.find(r => r.requirement === 'FR-001');
  assert.strictEqual(row.status, 'in-progress');
});

test('renderTraceMarkdown emits a generated header and summary table', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '005-md', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): svc',
    tasks: '- [x] T010 [US1] [FR-001,DES-001] do it in src/a.ts'
  });
  const trace = lib.buildTrace(dir, { repoRoot: repo, testRefs: { 'FR-001': ['tests/a.test.ts'] } });
  const md = lib.renderTraceMarkdown(dir, trace, { repoRoot: repo });
  assert.ok(md.includes('GENERATED FILE'));
  assert.ok(md.includes('# Traceability: Auth'));
  assert.ok(md.includes('| FR-001 |'));
});

// --- test scanning ---

test('scanTestRefs finds requirement/task IDs in test files', () => {
  const repo = tmpRepo();
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'tests', 'login.test.js'), 'test("FR-001 login works and T010", () => {});');
  const refs = lib.scanTestRefs(repo);
  assert.ok(refs['FR-001'], 'found FR-001');
  assert.ok(refs['FR-001'][0].includes('login.test.js'));
  assert.ok(refs['T010'], 'found T010');
});

// --- exec-plan ---

test('laneFor routes by description keywords', () => {
  assert.strictEqual(execPlan.laneFor({ description: 'Create React component in ui' }), 'frontend');
  assert.strictEqual(execPlan.laneFor({ description: 'Implement API endpoint service' }), 'backend');
  assert.strictEqual(execPlan.laneFor({ description: 'Write project README' }), 'orchestrator');
});

test('buildModel groups foundational then per-story waves', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '006-waves', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): svc',
    tasks: [
      '- [ ] T001 Setup project',
      '- [ ] T010 [P] [US1] [FR-001] Build API service in src/api.ts',
      '- [ ] T020 [US2] [FR-002] Build UI component in src/ui.tsx'
    ].join('\n')
  });
  const model = execPlan.buildModel(dir, repo);
  assert.strictEqual(model.waves[0].worktree, 'main');
  assert.ok(model.waves.some(w => w.worktree === 'wt-us1'));
  assert.ok(model.waves.some(w => w.worktree === 'wt-us2'));
  const apiTask = model.tasks.find(t => t.id === 'T010');
  assert.strictEqual(apiTask.lane, 'backend');
});

test('applyTaskCheckboxes toggles task lines from a done map', () => {
  const tasks = '- [ ] T010 Do thing\n- [ ] T011 Other';
  const next = lib.applyTaskCheckboxes(tasks, { T010: true });
  assert.ok(next.includes('[x] T010'));
  assert.ok(next.includes('[ ] T011'));
});

test('markTasksDone updates tasks.md and .state.json completedTasks', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '007-mark', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): svc',
    tasks: '- [ ] T010 [US1] [FR-001] work in src/a.ts'
  });
  lib.writeState(dir, lib.defaultState('007-mark'));
  const res = lib.markTasksDone(dir, ['T010']);
  assert.deepStrictEqual(res.marked, ['T010']);
  const tasks = fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8');
  assert.ok(tasks.includes('[x] T010'));
  const state = lib.readState(dir);
  assert.strictEqual(state.completedTasks.T010, true);
});

test('syncTasksFromState writes completedTasks back to tasks.md', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '008-sync', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): svc',
    tasks: '- [ ] T010 [US1] [FR-001] work in src/a.ts'
  });
  lib.writeState(dir, { ...lib.defaultState('008-sync'), completedTasks: { T010: true } });
  const res = lib.syncTasksFromState(dir);
  assert.strictEqual(res.updated, true);
  const tasks = fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8');
  assert.ok(tasks.includes('[x] T010'));
});

test('getNextSlice returns foundational tasks before user stories', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '009-slice', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): svc',
    tasks: [
      '- [ ] T001 Setup',
      '- [ ] T010 [US1] [FR-001] story work in src/a.ts'
    ].join('\n')
  });
  const next = lib.getNextSlice(dir);
  assert.strictEqual(next.slice.kind, 'foundational');
  assert.deepStrictEqual(next.slice.tasks, ['T001']);
});

test('getNextSlice returns earliest open user story when foundational done', () => {
  const repo = tmpRepo();
  const dir = writeFeature(repo, '010-slice2', {
    spec: FULL_SPEC,
    design: '- **DES-001** (FR-001): svc',
    tasks: [
      '- [x] T001 Setup',
      '- [ ] T010 [US1] [FR-001] a in src/a.ts',
      '- [ ] T020 [US2] [FR-001] b in src/b.ts'
    ].join('\n')
  });
  const next = lib.getNextSlice(dir);
  assert.strictEqual(next.slice.story, 'US1');
  assert.deepStrictEqual(next.slice.tasks, ['T010']);
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
