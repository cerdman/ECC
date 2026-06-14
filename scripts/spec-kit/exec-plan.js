#!/usr/bin/env node
/**
 * Generate agent_execution_plan.md for a spec-driven feature.
 *
 * Usage:
 *   node scripts/spec-kit/exec-plan.js <feature-dir> [--write] [--json]
 *
 * Reads tasks.md, groups tasks into execution waves (Setup/Foundational first,
 * then one wave per user story), assigns each task a lane:
 *   - Claude orchestrator (sole filesystem writer; integrates everything)
 *   - Codex backend prototype (logic/API/data tasks)
 *   - Gemini / antigravity frontend prototype (UI/component/style tasks)
 * and a worktree per user story. Codex (reviewer role) is the mandatory gate.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

function parseArgs(argv) {
  const args = { _: [], write: false, json: false };
  for (const a of argv) {
    if (a === '--write') args.write = true;
    else if (a === '--json') args.json = true;
    else args._.push(a);
  }
  return args;
}

const FRONTEND_RE = /\b(ui|component|page|screen|style|css|tsx|jsx|view|layout|frontend|html|tailwind|vue|svelte)\b/i;
const BACKEND_RE = /\b(api|endpoint|service|model|database|db|migration|schema|auth|backend|server|controller|repository|handler|query)\b/i;

function laneFor(task) {
  const text = `${task.description}`;
  if (FRONTEND_RE.test(text)) return 'frontend';
  if (BACKEND_RE.test(text)) return 'backend';
  return 'orchestrator';
}

function buildWaves(tasks) {
  // Group: setup+foundational (no story) into Wave 1, then per-story waves.
  const foundational = tasks.filter(t => !t.story);
  const byStory = new Map();
  for (const t of tasks) {
    if (!t.story) continue;
    if (!byStory.has(t.story)) byStory.set(t.story, []);
    byStory.get(t.story).push(t);
  }

  const waves = [];
  if (foundational.length) {
    waves.push({ name: 'Foundational (must complete first)', worktree: 'main', tasks: foundational });
  }
  const stories = Array.from(byStory.keys()).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10);
    const nb = parseInt(b.replace(/\D/g, ''), 10);
    return na - nb;
  });
  for (const story of stories) {
    waves.push({
      name: `User Story ${story.replace('US', '')} (${story})`,
      worktree: `wt-${story.toLowerCase()}`,
      tasks: byStory.get(story)
    });
  }
  return waves;
}

function laneLabel(lane) {
  switch (lane) {
    case 'backend': return 'backend (Codex prototype -> Claude applies)';
    case 'frontend': return 'frontend (Gemini/antigravity prototype -> Claude applies)';
    default: return 'orchestrator (Claude)';
  }
}

function render(featureDir, model, repoRoot) {
  const rel = path.relative(repoRoot, featureDir).split(path.sep).join('/');
  const parallel = model.tasks.filter(t => t.parallel).length;
  const lines = [];
  lines.push('<!--');
  lines.push(`  GENERATED FILE — regenerate with: node scripts/spec-kit/exec-plan.js ${rel} --write`);
  lines.push('  Claude is the orchestrator and the ONLY filesystem writer; external agents are read-only.');
  lines.push('-->');
  lines.push(`# Agent Execution Plan: ${model.featureName}`);
  lines.push('');
  lines.push(`**Feature**: \`${rel}/\`  |  **Generated**: ${new Date().toISOString()}  |  **Tasks**: ${model.tasks.length} (${parallel} parallelizable)`);
  lines.push('');
  lines.push('## Lanes');
  lines.push('');
  lines.push('| Lane | Agent | Role | Writes files? |');
  lines.push('|------|-------|------|---------------|');
  lines.push('| Orchestrator | Claude (this session) | Integrate, refactor, apply all edits | YES (sole writer) |');
  lines.push('| Backend prototype | Codex (`scripts/dispatch/codex.sh`) | Backend/logic unified-diff prototype | no |');
  lines.push('| Frontend prototype | Gemini / antigravity-cli (`scripts/dispatch/gemini.sh`) | Frontend/UI unified-diff prototype | no |');
  lines.push('| Review gate | Codex (`reviewer` role) | Mandatory audit gate before delivery | no |');
  lines.push('');
  lines.push('## Execution Waves');
  lines.push('');
  let waveNum = 1;
  for (const wave of model.waves) {
    lines.push(`### Wave ${waveNum} — ${wave.name}`);
    lines.push('');
    lines.push('| Task | Lane | Parallel | Worktree |');
    lines.push('|------|------|----------|----------|');
    for (const t of wave.tasks) {
      lines.push(`| ${t.id} | ${laneLabel(t.lane)} | ${t.parallel ? '[P]' : ''} | ${wave.worktree} |`);
    }
    lines.push('');
    waveNum += 1;
  }
  lines.push('## Review Gate');
  lines.push('');
  lines.push('After each wave\'s edits are applied and self-verified, dispatch the diff to the Codex `reviewer` role:');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/dispatch/run.js codex <task-file> <handoff-file> <status-file> reviewer');
  lines.push('```');
  lines.push('');
  lines.push('Blocker findings must be resolved before the wave is considered done. Record the Codex session id for resume.');
  lines.push('');
  lines.push('## Swarm Wiring');
  lines.push('');
  lines.push('Launch parallel waves with `scripts/orchestrate-worktrees.js`; each worker `launcherCommand` points at `scripts/dispatch/codex.sh` (backend) or `scripts/dispatch/gemini.sh` (frontend). Claude integrates the handoff files and applies edits in the parent checkout.');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Code sovereignty: external models never write to disk; they return unified diffs.');
  lines.push('- Backend decisions follow Codex; frontend/visual decisions follow Gemini.');
  lines.push('- After every wave: `trace.js --write`, mark tasks done, `state-sync.js`.');
  lines.push('');
  return lines.join('\n');
}

function buildModel(featureDir, repoRoot) {
  const tasksText = lib.readFileSafe(path.join(featureDir, 'tasks.md')) || '';
  const specText = lib.readFileSafe(path.join(featureDir, 'spec.md')) || '';
  const { tasks } = lib.parseTasks(tasksText);
  for (const t of tasks) t.lane = laneFor(t);
  const waves = buildWaves(tasks);
  return { tasks, waves, featureName: lib.featureName(featureDir, specText) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = lib.findRepoRoot();
  const featureDir = args._[0] ? path.resolve(args._[0]) : null;

  if (!featureDir || !fs.existsSync(path.join(featureDir, 'tasks.md'))) {
    process.stderr.write('Usage: exec-plan.js <feature-dir> (must contain tasks.md) [--write] [--json]\n');
    process.exit(2);
  }

  const model = buildModel(featureDir, repoRoot);

  if (args.json) {
    process.stdout.write(JSON.stringify(model, null, 2) + '\n');
    return;
  }

  const md = render(featureDir, model, repoRoot);
  if (args.write) {
    fs.writeFileSync(path.join(featureDir, 'agent_execution_plan.md'), md);
    process.stdout.write(`Wrote ${path.join(featureDir, 'agent_execution_plan.md')} (${model.tasks.length} tasks, ${model.waves.length} waves)\n`);
  } else {
    process.stdout.write(md);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, laneFor, buildWaves, buildModel };
