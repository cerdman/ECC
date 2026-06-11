'use strict';

/**
 * workflow-dispatch.js - Dispatch ai-augmented-workflow phases to external
 * harness workers (claude, codex, cursor-agent, gemini, opencode) via the
 * tmux/worktree orchestrator, and ingest their handoffs back into the
 * workflow's state and memory log.
 *
 * Each dispatched worker runs in an isolated git worktree inside a tmux
 * session. The generated task.md carries the phase objective, the workflow
 * memory tail, and the GateGuard fact-forcing protocol so external workers
 * investigate before editing instead of guessing.
 */

const path = require('path');

const {
  buildOrchestrationPlan,
  executePlan
} = require('./tmux-worktree-orchestrator');
const { loadWorkerSnapshots } = require('./orchestration-session');
const {
  STAGES,
  resolveWorkflowsDir,
  getWorkflow,
  saveWorkflow,
  currentPhase,
  updatePhase,
  addMemory
} = require('./workflow-state');

const ECC_ROOT = path.resolve(__dirname, '..', '..');
const MEMORY_TAIL_ENTRIES = 10;

/**
 * Default launcher templates per harness. {task_file_sh}, {handoff_file_sh},
 * and {status_file_sh} are shell-quoted by the orchestrator's template
 * variables. Any other CLI can be used via an explicit launcher template.
 */
const HARNESS_LAUNCHERS = {
  claude: 'claude -p "$(cat {task_file_sh})"',
  codex: `bash ${ECC_ROOT}/scripts/orchestrate-codex-worker.sh {task_file_sh} {handoff_file_sh} {status_file_sh}`,
  cursor: 'cursor-agent -p "$(cat {task_file_sh})"',
  gemini: 'gemini -p "$(cat {task_file_sh})"',
  opencode: 'opencode run "$(cat {task_file_sh})"'
};

const GATEGUARD_PROTOCOL = [
  '## GateGuard protocol (fact-forcing gates)',
  '',
  'This repository gates edits (deny -> present facts -> retry). Comply with it:',
  '',
  '1. Before your FIRST Edit/Write to any file, present: every file that',
  '   imports/requires it (use grep), the public functions/classes affected,',
  '   the structure and date format of any data files it touches (redacted',
  '   values), and the task objective quoted verbatim. Then retry the edit.',
  '2. Before any destructive command (rm -rf, git reset --hard, force push,',
  '   drop table): list the exact targets, write a one-line rollback',
  '   procedure, and quote the task objective verbatim.',
  '3. Never disable or bypass the gate (no ECC_GATEGUARD=off, no',
  '   ECC_DISABLED_HOOKS). If a gate blocks you, present the facts it asks',
  '   for — the investigation is the point.'
].join('\n');

function resolveHarnessLauncher(harness, explicitLauncher) {
  if (explicitLauncher) {
    return explicitLauncher;
  }
  const launcher = HARNESS_LAUNCHERS[harness];
  if (!launcher) {
    const known = Object.keys(HARNESS_LAUNCHERS).join(', ');
    throw new Error(`Unknown harness "${harness}" (known: ${known}; or pass an explicit launcher template)`);
  }
  return launcher;
}

function resolvePhase(workflow, phaseId) {
  if (!phaseId) {
    const phase = currentPhase(workflow);
    if (!phase) {
      throw new Error(`Workflow ${workflow.id} has no active or pending phase to dispatch`);
    }
    return phase;
  }
  const phase = workflow.phases.find(entry => entry.id === phaseId);
  if (!phase) {
    const known = workflow.phases.map(entry => entry.id).join(', ');
    throw new Error(`Unknown phase "${phaseId}" (known: ${known})`);
  }
  return phase;
}

/**
 * Compose the worker task text for one phase: objective, artifacts, memory
 * tail (business context at every layer), GateGuard protocol, and the exact
 * report-back commands so workers update workflow state themselves when the
 * harness allows it.
 */
function buildPhaseTaskText(workflow, phase, options = {}) {
  const stage = STAGES[phase.stage];
  const memoryTail = workflow.memory.slice(-MEMORY_TAIL_ENTRIES);
  const lines = [
    `Workflow: ${workflow.name} [${workflow.id}]`,
    workflow.description ? `Description: ${workflow.description}` : null,
    `Phase: ${phase.id} — ${phase.name}`,
    `Stage: ${stage.name} (${stage.timeWeight}% of effort, ${stage.impact} impact)`,
    `Role: ${phase.role}`,
    '',
    '## Phase objective',
    '',
    options.task || phase.name,
    ...(phase.notes.length > 0 ? ['', '### Phase notes', ...phase.notes.map(note => `- ${note}`)] : []),
    ...(phase.artifacts.length > 0
      ? ['', '### Existing artifacts (read these first)', ...phase.artifacts.map(artifact => `- \`${artifact}\``)]
      : []),
    ...(memoryTail.length > 0
      ? [
          '',
          '## Workflow memory (business context — honor every entry)',
          '',
          ...memoryTail.map(entry => `- ${entry.at}${entry.phase ? ` [${entry.phase}]` : ''} ${entry.note}`)
        ]
      : []),
    '',
    GATEGUARD_PROTOCOL,
    '',
    '## Reporting back',
    '',
    'Work only in your own git worktree; never touch sibling worktrees or the',
    'parent checkout. End your run with exactly these sections: Summary,',
    'Files Changed, Validation, Remaining Risks. If you can run commands,',
    'record progress in the shared workflow state:',
    '',
    '```bash',
    `node ${ECC_ROOT}/scripts/workflow.js memory ${workflow.id} --phase ${phase.id} --note "<decision or finding>" --dir ${resolveWorkflowsDir({ cwd: options.cwd, dir: options.dir })}`,
    '```'
  ];

  return lines.filter(line => line !== null).join('\n');
}

/**
 * Build the orchestrator config for dispatching one phase to one or more
 * harness workers. Pure — does not touch workflow state or spawn anything.
 */
function buildDispatchConfig(workflow, phase, options = {}) {
  const harnesses = options.harnesses && options.harnesses.length > 0 ? options.harnesses : ['claude'];
  const sessionName = `${workflow.id}-${phase.id}`;

  return {
    sessionName,
    repoRoot: options.repoRoot || process.cwd(),
    baseRef: options.baseRef || 'HEAD',
    replaceExisting: Boolean(options.replace),
    ...(options.coordinationRoot ? { coordinationRoot: options.coordinationRoot } : {}),
    ...(options.worktreeRoot ? { worktreeRoot: options.worktreeRoot } : {}),
    workers: harnesses.map(harness => ({
      name: `${phase.id}-${harness}`,
      task: buildPhaseTaskText(workflow, phase, options),
      launcherCommand: resolveHarnessLauncher(harness, options.launcher)
    }))
  };
}

/**
 * Dispatch a workflow phase to external harness workers.
 *
 * Dry-run by default: builds the orchestration plan (worktrees, tmux panes,
 * launcher commands) without executing. Pass execute: true to create the
 * worktrees and launch the tmux session. Either way the dispatch is recorded
 * on the workflow (agents on the phase, a dispatches entry, a memory note).
 */
function dispatchPhase(id, options = {}) {
  const storeOptions = { cwd: options.cwd, dir: options.dir };
  const workflow = getWorkflow(id, storeOptions);
  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }

  const phase = resolvePhase(workflow, options.phase);
  const harnesses = options.harnesses && options.harnesses.length > 0 ? options.harnesses : ['claude'];
  const config = buildDispatchConfig(workflow, phase, { ...options, harnesses });
  const plan = buildOrchestrationPlan(config);

  let executed = false;
  if (options.execute) {
    executePlan(plan, options.runtime || {});
    executed = true;
  }

  updatePhase(workflow.id, phase.id, { agents: harnesses.map(harness => `${harness}-worker`) }, storeOptions);

  const refreshed = getWorkflow(workflow.id, storeOptions);
  if (!Array.isArray(refreshed.dispatches)) {
    refreshed.dispatches = [];
  }
  // Upsert by session name: re-dispatching a phase (dry-run then --execute)
  // replaces the record instead of stacking duplicates that ingest would
  // process repeatedly.
  refreshed.dispatches = refreshed.dispatches.filter(entry => entry.sessionName !== plan.sessionName);
  refreshed.dispatches.push({
    at: new Date().toISOString(),
    phase: phase.id,
    harnesses,
    sessionName: plan.sessionName,
    coordinationDir: plan.coordinationDir,
    executed
  });
  saveWorkflow(refreshed, storeOptions);

  addMemory(
    workflow.id,
    `${executed ? 'Dispatched' : 'Planned dispatch of'} ${harnesses.join(', ')} worker(s); coordination: ${plan.coordinationDir}`,
    { ...storeOptions, phase: phase.id }
  );

  return { plan, executed };
}

/**
 * Ingest worker handoffs from a dispatch back into the workflow: each
 * worker's state and summary become memory entries, and handoff files are
 * attached to the phase as artifacts.
 */
function ingestDispatch(id, options = {}) {
  const storeOptions = { cwd: options.cwd, dir: options.dir };
  const workflow = getWorkflow(id, storeOptions);
  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }

  const dispatches = Array.isArray(workflow.dispatches) ? workflow.dispatches : [];
  const selected = options.session
    ? dispatches.filter(entry => entry.sessionName === options.session)
    : dispatches;
  if (selected.length === 0) {
    throw new Error(
      options.session
        ? `No dispatch found for session "${options.session}" on workflow ${id}`
        : `Workflow ${id} has no recorded dispatches to ingest`
    );
  }

  const ingested = [];
  for (const dispatch of selected) {
    const snapshots = loadWorkerSnapshots(dispatch.coordinationDir);
    for (const snapshot of snapshots) {
      const state = snapshot.status.state || 'unknown';
      const summary = snapshot.handoff.summary.filter(line => line && line.toLowerCase() !== 'pending');
      const summaryText = summary.length > 0 ? summary.join('; ') : 'no summary yet';

      addMemory(
        workflow.id,
        `Worker ${snapshot.workerSlug} (${dispatch.sessionName}) state: ${state}; ${summaryText}`,
        { ...storeOptions, phase: dispatch.phase }
      );
      updatePhase(workflow.id, dispatch.phase, { artifact: snapshot.files.handoff }, storeOptions);

      ingested.push({
        sessionName: dispatch.sessionName,
        phase: dispatch.phase,
        workerSlug: snapshot.workerSlug,
        state,
        summary,
        handoffFile: snapshot.files.handoff
      });
    }
  }

  return ingested;
}

module.exports = {
  ECC_ROOT,
  GATEGUARD_PROTOCOL,
  HARNESS_LAUNCHERS,
  buildPhaseTaskText,
  buildDispatchConfig,
  dispatchPhase,
  ingestDispatch
};
