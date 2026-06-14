#!/usr/bin/env node
/**
 * Shared library for the ECC spec-driven-workflow (Kiro-style) lane.
 *
 * Pure, dependency-free helpers for: feature scaffolding, unique-ID parsing
 * across spec.md / design.md / tasks.md, test scanning, and trace-matrix
 * construction. Used by feature.js, prereqs.js, trace.js, state-sync.js,
 * exec-plan.js and the test suite.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMPLATE_DIR = path.resolve(__dirname, '..', '..', 'skills', 'spec-driven-workflow', 'templates');
const CONSTITUTION_REL = path.join('.specify', 'memory', 'constitution.md');

// --- Generic helpers ---------------------------------------------------------

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60) || 'feature';
}

function shortName(text, maxWords = 4) {
  const words = slugify(text).split('-').filter(Boolean).slice(0, maxWords);
  return words.join('-') || 'feature';
}

function readFileSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return null;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function uuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

// --- Repo / feature directory resolution ------------------------------------

function findRepoRoot(start) {
  let dir = path.resolve(start || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(start || process.cwd());
    }
    dir = parent;
  }
}

function specsRoot(repoRoot) {
  return path.join(repoRoot || findRepoRoot(), 'specs');
}

function constitutionPath(repoRoot) {
  return path.join(repoRoot || findRepoRoot(), CONSTITUTION_REL);
}

/**
 * Scan an existing specs/ directory and return the next zero-padded number.
 */
function nextFeatureNumber(root) {
  const dir = specsRoot(root);
  let max = 0;
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const m = entry.name.match(/^(\d{3,})-/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
  }
  return String(max + 1).padStart(3, '0');
}

function listFeatureDirs(root) {
  const dir = specsRoot(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d{3,}-/.test(e.name))
    .map(e => path.join(dir, e.name))
    .sort();
}

// --- Feature state -----------------------------------------------------------

const PHASES = [
  'research', 'constitution', 'specify', 'clarify', 'design',
  'tasks', 'trace', 'analyze', 'confirm', 'implement', 'verify'
];

function statePath(featureDir) {
  return path.join(featureDir, '.state.json');
}

function defaultState(featureId, uid) {
  return {
    feature: featureId,
    uid: uid || uuid(),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    phase: 'specify',
    active: false,
    gate: {
      clarify: 'pending',
      constitution: 'pending',
      trace: 'pending',
      audit: 'pending',
      confirm: 'pending',
      verify: 'pending'
    },
    research: []
  };
}

function readState(featureDir) {
  const raw = readFileSafe(statePath(featureDir));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeState(featureDir, state) {
  ensureDir(featureDir);
  const next = { ...state, updated: new Date().toISOString() };
  fs.writeFileSync(statePath(featureDir), JSON.stringify(next, null, 2) + '\n');
  return next;
}

// --- Feature scaffolding -----------------------------------------------------

function createFeature(description, options = {}) {
  if (!description || !String(description).trim()) {
    throw new Error('feature description is required');
  }
  const repoRoot = options.repoRoot || findRepoRoot();
  const name = options.shortName ? slugify(options.shortName) : shortName(description);
  const number = options.number || nextFeatureNumber(repoRoot);
  const featureId = `${number}-${name}`;
  const featureDir = path.join(specsRoot(repoRoot), featureId);

  ensureDir(featureDir);
  ensureDir(path.join(featureDir, 'checklists'));

  const featureUid = uuid();
  const specTemplate = readFileSafe(path.join(TEMPLATE_DIR, 'spec.md')) || '# Feature Specification\n';
  const specFile = path.join(featureDir, 'spec.md');
  if (!fs.existsSync(specFile)) {
    const filled = specTemplate
      .replace(/\[FEATURE_UID\]/g, featureUid)
      .replace(/\[###-feature-name\]/g, featureId)
      .replace(/\[DATE\]/g, new Date().toISOString().slice(0, 10))
      .replace(/\$ARGUMENTS/g, String(description).trim());
    fs.writeFileSync(specFile, filled);
  }

  const state = defaultState(featureId, featureUid);
  writeState(featureDir, state);

  return { repoRoot, featureId, featureDir, specFile, uid: featureUid };
}

// --- Parsing -----------------------------------------------------------------

function uniq(arr) {
  return Array.from(new Set(arr));
}

/**
 * Parse spec.md -> functional requirements, success criteria, user stories.
 */
function parseSpec(text) {
  const src = text || '';
  const frs = uniq((src.match(/\bFR-\d{3,}\b/g) || []));
  const scs = uniq((src.match(/\bSC-\d{3,}\b/g) || []));
  const stories = [];
  const storyRe = /^#{2,4}\s+User Story\s+(\d+)\b.*?(?:\(Priority:\s*(P\d+)\))?\s*$/gim;
  let m;
  while ((m = storyRe.exec(src)) !== null) {
    stories.push({ id: `US${m[1]}`, num: parseInt(m[1], 10), priority: m[2] || null });
  }
  return { frs: frs.sort(), scs: scs.sort(), stories };
}

/**
 * Parse design.md -> DES elements, each with the FR/SC it cites (same line).
 */
function parseDesign(text) {
  const src = text || '';
  const elements = [];
  const re = /\bDES-(\d{3,})\b([^\n]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const id = `DES-${m[1]}`;
    const rest = m[2] || '';
    const refs = uniq([
      ...(rest.match(/\bFR-\d{3,}\b/g) || []),
      ...(rest.match(/\bSC-\d{3,}\b/g) || [])
    ]);
    elements.push({ id, refs });
  }
  // Merge duplicate DES ids (cite lists combine)
  const byId = new Map();
  for (const el of elements) {
    if (byId.has(el.id)) {
      byId.get(el.id).refs = uniq([...byId.get(el.id).refs, ...el.refs]);
    } else {
      byId.set(el.id, { id: el.id, refs: [...el.refs] });
    }
  }
  return { elements: Array.from(byId.values()) };
}

/**
 * Parse tasks.md checklist lines -> tasks with id, done state, story, refs.
 */
function parseTasks(text) {
  const src = text || '';
  const tasks = [];
  const lineRe = /^\s*-\s*\[([ xX])\]\s*(T\d{3,})\b(.*)$/gm;
  let m;
  while ((m = lineRe.exec(src)) !== null) {
    const done = m[1].toLowerCase() === 'x';
    const id = m[2];
    const rest = m[3] || '';
    const parallel = /\[P\]/.test(rest);
    const storyMatch = rest.match(/\[(US\d+)\]/);
    const refs = uniq([
      ...(rest.match(/\bFR-\d{3,}\b/g) || []),
      ...(rest.match(/\bSC-\d{3,}\b/g) || []),
      ...(rest.match(/\bDES-\d{3,}\b/g) || [])
    ]);
    tasks.push({
      id,
      done,
      parallel,
      story: storyMatch ? storyMatch[1] : null,
      refs,
      description: rest.replace(/\[[^\]]*\]/g, '').trim()
    });
  }
  return { tasks };
}

// --- Test scanning -----------------------------------------------------------

const TEST_DIR_HINTS = ['tests', 'test', '__tests__', 'spec'];
const TEST_FILE_RE = /(\.test\.|\.spec\.|_test\.|_spec\.)/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.venv', 'vendor', 'coverage']);

function scanTestRefs(repoRoot, options = {}) {
  const root = repoRoot || findRepoRoot();
  const idToFiles = {};
  const maxFiles = options.maxFiles || 5000;
  let scanned = 0;

  function consider(file) {
    if (scanned >= maxFiles) return;
    const base = path.basename(file);
    const rel = path.relative(root, file).split(path.sep).join('/');
    const inTestDir = TEST_DIR_HINTS.some(h => rel.split('/').includes(h));
    if (!TEST_FILE_RE.test(base) && !inTestDir) return;
    scanned += 1;
    const content = readFileSafe(file);
    if (!content) return;
    const ids = content.match(/\b(?:FR|SC|DES|T)-?\d{3,}\b/g) || [];
    for (const raw of ids) {
      const id = raw.replace(/^T(\d)/, 'T$1'); // normalize already
      if (!idToFiles[id]) idToFiles[id] = [];
      if (!idToFiles[id].includes(rel)) idToFiles[id].push(rel);
    }
  }

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') {
        if (entry.isDirectory() && !TEST_DIR_HINTS.includes(entry.name)) continue;
      }
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        consider(path.join(dir, entry.name));
      }
    }
  }

  walk(root);
  return idToFiles;
}

// --- Trace matrix ------------------------------------------------------------

function featureName(featureDir, specText) {
  const m = (specText || '').match(/^#\s+Feature Specification:\s*(.+)$/m);
  if (m) return m[1].trim();
  return path.basename(featureDir);
}

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}

/**
 * Find the spec feature whose tasks.md governs targetFile (if any).
 */
function findGoverningFeature(repoRoot, targetFile) {
  const root = repoRoot || findRepoRoot();
  const relTarget = normalizePath(path.relative(root, path.resolve(targetFile)));
  const baseTarget = normalizePath(path.basename(targetFile));
  if (!relTarget || relTarget.startsWith('..')) return null;

  for (const dir of listFeatureDirs(root)) {
    const tasksText = readFileSafe(path.join(dir, 'tasks.md'));
    if (!tasksText) continue;
    const haystack = normalizePath(tasksText);
    const referenced = haystack.includes(relTarget) ||
      (baseTarget.length > 3 && haystack.includes('/' + baseTarget)) ||
      (baseTarget.length > 3 && haystack.includes(' ' + baseTarget));
    if (referenced) {
      const state = readState(dir) || defaultState(path.basename(dir));
      return { dir, state, tasksText, featureId: state.feature || path.basename(dir) };
    }
  }
  return null;
}

/**
 * Task ids in tasks.md that reference targetFile.
 */
function taskIdsForFile(tasksText, repoRoot, targetFile) {
  const { tasks } = parseTasks(tasksText || '');
  const relTarget = normalizePath(path.relative(repoRoot, path.resolve(targetFile)));
  const baseTarget = normalizePath(path.basename(targetFile));
  return tasks
    .filter(t => {
      const d = normalizePath(t.description);
      return d.includes(relTarget) || (baseTarget.length > 3 && d.includes(baseTarget));
    })
    .map(t => ({ id: t.id, done: t.done, description: t.description }));
}

/**
 * Build the trace model. Returns { summary, rows, scRows, gaps, orphans, exitCode }.
 */
function buildTrace(featureDir, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const spec = parseSpec(readFileSafe(path.join(featureDir, 'spec.md')) || '');
  const design = parseDesign(readFileSafe(path.join(featureDir, 'design.md')) || '');
  const tasks = parseTasks(readFileSafe(path.join(featureDir, 'tasks.md')) || '');
  const testRefs = options.testRefs || scanTestRefs(repoRoot);

  const designByReq = {};
  for (const el of design.elements) {
    for (const ref of el.refs) {
      (designByReq[ref] = designByReq[ref] || []).push(el.id);
    }
  }
  const tasksByRef = {};
  for (const t of tasks.tasks) {
    for (const ref of t.refs) {
      (tasksByRef[ref] = tasksByRef[ref] || []).push(t);
    }
  }
  const storyByReq = {}; // derived from tasks that carry both story + req

  const rows = [];
  const gaps = [];
  for (const fr of spec.frs) {
    const des = uniq(designByReq[fr] || []);
    const frTasks = tasksByRef[fr] || [];
    const stories = uniq(frTasks.map(t => t.story).filter(Boolean));
    const tests = testRefs[fr] || [];
    const taskTests = uniq(frTasks.flatMap(t => testRefs[t.id] || []));
    const allTests = uniq([...tests, ...taskTests]);

    let status;
    if (des.length === 0) {
      status = 'gap: no design';
      gaps.push(`${fr} has no design element (DES).`);
    } else if (frTasks.length === 0) {
      status = 'gap: no task';
      gaps.push(`${fr} has design but no implementing task.`);
    } else if (frTasks.every(t => t.done)) {
      status = allTests.length ? 'done' : 'in-progress';
      if (!allTests.length) gaps.push(`${fr} tasks complete but no test references it.`);
    } else if (frTasks.some(t => t.done)) {
      status = 'in-progress';
    } else {
      status = 'planned';
    }

    rows.push({
      requirement: fr,
      stories,
      design: des,
      tasks: frTasks.map(t => t.id),
      tests: allTests,
      status
    });
  }

  // Success criteria coverage (tests only).
  const scRows = spec.scs.map(sc => {
    const tests = testRefs[sc] || [];
    return { criterion: sc, tests, status: tests.length ? 'covered' : 'gap: unverified' };
  });
  for (const r of scRows) {
    if (r.status.startsWith('gap')) gaps.push(`${r.criterion} has no verifying test.`);
  }

  // Orphans (structural).
  const orphans = [];
  for (const el of design.elements) {
    const hasReq = el.refs.length > 0;
    if (!hasReq) orphans.push(`${el.id} cites no requirement (orphan design element).`);
    const hasTask = (tasks.tasks || []).some(t => t.refs.includes(el.id));
    if (!hasTask) orphans.push(`${el.id} has no implementing task (orphan design element).`);
  }
  for (const t of tasks.tasks) {
    const cites = t.refs.some(r => /^FR-|^SC-|^DES-/.test(r));
    if (!cites && t.story) {
      orphans.push(`${t.id} cites no requirement or design element (orphan task).`);
    }
  }

  const doneCount = tasks.tasks.filter(t => t.done).length;
  const reqsWithTests = rows.filter(r => r.tests.length > 0).length;

  const summary = {
    frs: spec.frs.length,
    scs: spec.scs.length,
    des: design.elements.length,
    tasks: tasks.tasks.length,
    tasksDone: doneCount,
    reqsWithTests,
    gaps: gaps.length + orphans.length
  };

  const hasStructuralOrphan =
    orphans.length > 0 ||
    rows.some(r => r.status === 'gap: no design' || r.status === 'gap: no task');

  const exitCode = hasStructuralOrphan && !options.allowGaps ? 1 : 0;

  return { summary, rows, scRows, gaps: uniq([...orphans, ...gaps]), orphans, exitCode, featureName: featureName(featureDir, readFileSafe(path.join(featureDir, 'spec.md'))) };
}

function fmtList(arr) {
  return arr && arr.length ? arr.join(', ') : '—';
}

/**
 * Apply done/not-done checkboxes from a map { T001: true, T002: false }.
 */
function applyTaskCheckboxes(tasksText, doneMap) {
  if (!tasksText || !doneMap || Object.keys(doneMap).length === 0) {
    return tasksText;
  }
  return tasksText.replace(
    /^(\s*-\s*)\[([ xX])\]\s*(T\d{3,})\b(.*)$/gm,
    (line, prefix, _box, taskId, tail) => {
      if (!(taskId in doneMap)) return line;
      const mark = doneMap[taskId] ? 'x' : ' ';
      return `${prefix}[${mark}] ${taskId}${tail}`;
    }
  );
}

/**
 * Merge .state.json completedTasks into tasks.md (state -> docs).
 */
function syncTasksFromState(featureDir) {
  const tasksFile = path.join(featureDir, 'tasks.md');
  const tasksText = readFileSafe(tasksFile);
  if (!tasksText) return { updated: false, reason: 'no tasks.md' };

  const state = readState(featureDir) || {};
  const fromState = state.completedTasks || {};
  const { tasks } = parseTasks(tasksText);
  const doneMap = {};
  for (const t of tasks) {
    if (t.id in fromState) doneMap[t.id] = Boolean(fromState[t.id]);
  }
  if (Object.keys(doneMap).length === 0) return { updated: false, reason: 'no completedTasks in state' };

  const next = applyTaskCheckboxes(tasksText, doneMap);
  if (next === tasksText) return { updated: false, reason: 'already in sync' };
  fs.writeFileSync(tasksFile, next);
  return { updated: true, tasks: Object.keys(doneMap).filter(id => doneMap[id]) };
}

/**
 * Mark task ids done in both tasks.md and .state.json completedTasks.
 */
function markTasksDone(featureDir, taskIds) {
  const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
  const tasksFile = path.join(featureDir, 'tasks.md');
  const tasksText = readFileSafe(tasksFile);
  if (!tasksText) throw new Error('tasks.md not found');

  const doneMap = {};
  for (const id of ids) doneMap[id] = true;
  const nextTasks = applyTaskCheckboxes(tasksText, doneMap);
  fs.writeFileSync(tasksFile, nextTasks);

  const state = readState(featureDir) || defaultState(path.basename(featureDir));
  const completed = { ...(state.completedTasks || {}) };
  for (const id of ids) completed[id] = true;
  writeState(featureDir, { ...state, completedTasks: completed, phase: state.phase || 'implement' });
  return { marked: ids, completedTasks: completed };
}

/**
 * Pick the next implementation slice: foundational tasks first, then per user story.
 */
function getNextSlice(featureDir) {
  const tasksText = readFileSafe(path.join(featureDir, 'tasks.md')) || '';
  const { tasks } = parseTasks(tasksText);
  const open = tasks.filter(t => !t.done);
  if (open.length === 0) return { slice: null, reason: 'all tasks done' };

  const foundational = open.filter(t => !t.story);
  if (foundational.length) {
    const parallel = foundational.filter(t => t.parallel);
    const pick = parallel.length ? parallel : foundational;
    return {
      slice: {
        kind: 'foundational',
        story: null,
        tasks: pick.map(t => t.id),
        parallel: parallel.length > 0
      }
    };
  }

  const byStory = new Map();
  for (const t of open) {
    const key = t.story || 'none';
    if (!byStory.has(key)) byStory.set(key, []);
    byStory.get(key).push(t);
  }
  const stories = Array.from(byStory.keys()).sort((a, b) => {
    const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
    return na - nb;
  });
  const story = stories[0];
  const storyTasks = byStory.get(story);
  const parallel = storyTasks.filter(t => t.parallel);
  const pick = parallel.length ? parallel : [storyTasks[0]];
  return {
    slice: {
      kind: 'user-story',
      story,
      tasks: pick.map(t => t.id),
      parallel: parallel.length > 0
    }
  };
}

function renderTraceMarkdown(featureDir, trace, options = {}) {
  const rel = path.relative(options.repoRoot || findRepoRoot(), featureDir).split(path.sep).join('/');
  const lines = [];
  lines.push('<!--');
  lines.push('  GENERATED FILE — do not hand-edit.');
  lines.push(`  Regenerate with: node scripts/spec-kit/trace.js ${rel} --write`);
  lines.push('-->');
  lines.push(`# Traceability: ${trace.featureName}`);
  lines.push('');
  lines.push(`**Feature**: \`${rel}/\`  |  **Generated**: ${new Date().toISOString()}  |  **Source of truth**: spec.md, design.md, tasks.md`);
  lines.push('');
  lines.push('## Coverage Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Functional requirements (FR) | ${trace.summary.frs} |`);
  lines.push(`| Success criteria (SC) | ${trace.summary.scs} |`);
  lines.push(`| Design elements (DES) | ${trace.summary.des} |`);
  lines.push(`| Tasks (T) | ${trace.summary.tasks} |`);
  lines.push(`| Tasks done | ${trace.summary.tasksDone} |`);
  lines.push(`| Requirements with tests | ${trace.summary.reqsWithTests} / ${trace.summary.frs} |`);
  lines.push(`| Open coverage gaps | ${trace.summary.gaps} |`);
  lines.push('');
  lines.push('## Requirement -> Design -> Tasks -> Tests');
  lines.push('');
  lines.push('| Requirement | Stories | Design | Tasks | Tests | Status |');
  lines.push('|-------------|---------|--------|-------|-------|--------|');
  for (const r of trace.rows) {
    lines.push(`| ${r.requirement} | ${fmtList(r.stories)} | ${fmtList(r.design)} | ${fmtList(r.tasks)} | ${fmtList(r.tests)} | ${r.status} |`);
  }
  lines.push('');
  lines.push('## Success Criteria');
  lines.push('');
  lines.push('| Criterion | Verified by | Status |');
  lines.push('|-----------|-------------|--------|');
  for (const r of trace.scRows) {
    lines.push(`| ${r.criterion} | ${fmtList(r.tests)} | ${r.status} |`);
  }
  lines.push('');
  lines.push('## Coverage Gaps');
  lines.push('');
  if (trace.gaps.length === 0) {
    lines.push('- None.');
  } else {
    for (const g of trace.gaps) lines.push(`- ${g}`);
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  TEMPLATE_DIR,
  CONSTITUTION_REL,
  PHASES,
  slugify,
  shortName,
  readFileSafe,
  ensureDir,
  uuid,
  findRepoRoot,
  specsRoot,
  constitutionPath,
  nextFeatureNumber,
  listFeatureDirs,
  statePath,
  defaultState,
  readState,
  writeState,
  createFeature,
  parseSpec,
  parseDesign,
  parseTasks,
  scanTestRefs,
  buildTrace,
  applyTaskCheckboxes,
  syncTasksFromState,
  markTasksDone,
  getNextSlice,
  normalizePath,
  findGoverningFeature,
  taskIdsForFile,
  renderTraceMarkdown,
  featureName
};
