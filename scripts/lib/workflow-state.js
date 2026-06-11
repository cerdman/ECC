'use strict';

/**
 * workflow-state.js - Multi-workflow, multi-agent state store for the
 * ai-augmented-workflow skill (/workflow command).
 *
 * Each workflow models the seven-step AI-augmented engineering pipeline
 * (requirements -> discovery -> PRD -> tech plan -> design -> implement ->
 * test -> review) and persists per-phase agent assignments, artifacts, and
 * a memory log so every layer of the pipeline keeps business context.
 *
 * Storage layout (project-local, overridable via ECC_WORKFLOWS_DIR):
 *   .claude/workflows/<workflow-id>/state.json   - structured state
 *   .claude/workflows/<workflow-id>/memory.md    - append-only memory log
 */

const fs = require('fs');
const path = require('path');

const PHASE_STATUSES = ['pending', 'active', 'done', 'skipped'];
const WORKFLOW_STATUSES = ['active', 'done', 'abandoned'];

const STAGES = {
  requirements: { name: 'Requirements Clarification', timeWeight: 25, impact: 'highest' },
  planning: { name: 'Planning', timeWeight: 35, impact: 'high' },
  implementation: { name: 'Implementation', timeWeight: 15, impact: 'lowest' },
  review: { name: 'Review', timeWeight: 25, impact: 'medium' }
};

const PHASES = [
  {
    id: 'requirements',
    name: 'Define high-level business requirements',
    stage: 'requirements',
    role: 'stakeholders + engineer',
    agents: ['planner'],
    optional: false,
    gate: false
  },
  {
    id: 'discovery',
    name: 'Understand how the current system works',
    stage: 'requirements',
    role: 'engineer',
    agents: ['code-explorer'],
    optional: false,
    gate: false
  },
  {
    id: 'prd',
    name: 'Create a plan (PRD) digestible for technical and non-technical readers',
    stage: 'planning',
    role: 'engineer',
    agents: ['planner'],
    optional: false,
    gate: true
  },
  {
    id: 'tech-plan',
    name: 'Create technical implementation plan',
    stage: 'planning',
    role: 'engineer',
    agents: ['architect'],
    optional: false,
    gate: false
  },
  {
    id: 'design',
    name: 'Create wireframes / mockups / on-brand components',
    stage: 'planning',
    role: 'design engineer',
    agents: [],
    optional: true,
    gate: false
  },
  {
    id: 'implement',
    name: 'Implement',
    stage: 'implementation',
    role: 'engineer',
    agents: ['tdd-guide'],
    optional: false,
    gate: false
  },
  {
    id: 'test',
    name: 'Test changes',
    stage: 'review',
    role: 'engineer',
    agents: ['e2e-runner'],
    optional: false,
    gate: false
  },
  {
    id: 'review',
    name: 'Code review',
    stage: 'review',
    role: 'engineer',
    agents: ['code-reviewer', 'security-reviewer'],
    optional: false,
    gate: true
  }
];

function nowIso() {
  return new Date().toISOString();
}

function resolveWorkflowsDir(options = {}) {
  if (options.dir) {
    return path.resolve(options.dir);
  }
  if (process.env.ECC_WORKFLOWS_DIR && process.env.ECC_WORKFLOWS_DIR.trim()) {
    return path.resolve(process.env.ECC_WORKFLOWS_DIR.trim());
  }
  return path.join(options.cwd || process.cwd(), '.claude', 'workflows');
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workflow';
}

function workflowDir(id, options = {}) {
  return path.join(resolveWorkflowsDir(options), id);
}

function statePath(id, options = {}) {
  return path.join(workflowDir(id, options), 'state.json');
}

function memoryPath(id, options = {}) {
  return path.join(workflowDir(id, options), 'memory.md');
}

function buildPhases(options = {}) {
  return PHASES.map((phase, index) => ({
    id: phase.id,
    name: phase.name,
    stage: phase.stage,
    role: phase.role,
    gate: phase.gate,
    status: phase.optional && options.design === false ? 'skipped' : index === 0 ? 'active' : 'pending',
    agents: [...phase.agents],
    artifacts: [],
    notes: [],
    startedAt: index === 0 ? nowIso() : null,
    completedAt: null
  }));
}

function createWorkflow(name, options = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    throw new Error('Workflow name is required');
  }

  const baseDir = resolveWorkflowsDir(options);
  const datePart = nowIso().slice(0, 10).replace(/-/g, '');
  const baseId = `wf-${datePart}-${slugify(trimmed)}`;

  let id = baseId;
  let attempt = 2;
  while (fs.existsSync(path.join(baseDir, id))) {
    id = `${baseId}-${attempt}`;
    attempt += 1;
  }

  const workflow = {
    id,
    name: trimmed,
    description: options.description || '',
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    phases: buildPhases(options),
    memory: [],
    dispatches: []
  };

  fs.mkdirSync(path.join(baseDir, id), { recursive: true });
  fs.writeFileSync(statePath(id, options), `${JSON.stringify(workflow, null, 2)}\n`);
  fs.writeFileSync(memoryPath(id, options), `# Workflow memory — ${trimmed} (${id})\n\n`);
  return workflow;
}

function getWorkflow(id, options = {}) {
  try {
    return JSON.parse(fs.readFileSync(statePath(id, options), 'utf8'));
  } catch (_error) {
    return null;
  }
}

function saveWorkflow(workflow, options = {}) {
  workflow.updatedAt = nowIso();
  fs.writeFileSync(statePath(workflow.id, options), `${JSON.stringify(workflow, null, 2)}\n`);
  return workflow;
}

function listWorkflows(options = {}) {
  const baseDir = resolveWorkflowsDir(options);
  let entries;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (_error) {
    return [];
  }

  const workflows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const workflow = getWorkflow(entry.name, options);
    if (!workflow) continue;
    if (!options.all && workflow.status !== 'active') continue;
    workflows.push(workflow);
  }

  return workflows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function currentPhase(workflow) {
  return (
    workflow.phases.find(phase => phase.status === 'active') ||
    workflow.phases.find(phase => phase.status === 'pending') ||
    null
  );
}

function findPhase(workflow, phaseId) {
  const phase = workflow.phases.find(entry => entry.id === phaseId);
  if (!phase) {
    const known = workflow.phases.map(entry => entry.id).join(', ');
    throw new Error(`Unknown phase "${phaseId}" (known: ${known})`);
  }
  return phase;
}

function requireWorkflow(id, options = {}) {
  const workflow = getWorkflow(id, options);
  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }
  return workflow;
}

/**
 * Patch one phase. Supported patch keys:
 *   status   - pending | active | done | skipped
 *   agent    - agent name to add to the phase's assignment list
 *   agents   - array of agent names to add
 *   artifact - artifact path/uri to record
 *   note     - free-text note appended to the phase
 */
function updatePhase(id, phaseId, patch = {}, options = {}) {
  const workflow = requireWorkflow(id, options);
  const phase = findPhase(workflow, phaseId);

  if (patch.status) {
    if (!PHASE_STATUSES.includes(patch.status)) {
      throw new Error(`Invalid phase status "${patch.status}" (use: ${PHASE_STATUSES.join(', ')})`);
    }
    if (patch.status === 'active' && !phase.startedAt) {
      phase.startedAt = nowIso();
    }
    if (patch.status === 'done') {
      phase.completedAt = nowIso();
    }
    phase.status = patch.status;
  }

  const agentsToAdd = [...(Array.isArray(patch.agents) ? patch.agents : []), ...(patch.agent ? [patch.agent] : [])];
  for (const agent of agentsToAdd) {
    if (agent && !phase.agents.includes(agent)) {
      phase.agents.push(agent);
    }
  }

  const artifactsToAdd = [...(Array.isArray(patch.artifacts) ? patch.artifacts : []), ...(patch.artifact ? [patch.artifact] : [])];
  for (const artifact of artifactsToAdd) {
    if (artifact && !phase.artifacts.includes(artifact)) {
      phase.artifacts.push(artifact);
    }
  }

  if (patch.note) {
    phase.notes.push(patch.note);
  }

  return saveWorkflow(workflow, options);
}

/**
 * GateGuard-style gate on gate phases (prd, review): deny the advance,
 * force concrete evidence, allow the retry. Self-evaluation ("looks good")
 * is not evidence — the verbatim user approval is.
 */
function assertGateApproved(workflow, phase, options) {
  if (!phase.gate) {
    return;
  }

  if (!options.approve) {
    throw new Error(
      [
        `GATE: phase "${phase.id}" requires explicit approval before advancing.`,
        'Present these facts, then retry with --approve:',
        `1. The artifact for this phase, recorded via --artifact (currently: ${phase.artifacts.length > 0 ? phase.artifacts.join(', ') : 'none'})`,
        "2. The user's approval quoted verbatim in --note",
        `Retry: workflow.js advance ${workflow.id} --approve --note "User approved: '<verbatim quote>'"`
      ].join('\n')
    );
  }

  if (!options.note || !String(options.note).trim()) {
    throw new Error(
      `GATE: --approve on phase "${phase.id}" requires --note quoting the user's approval verbatim`
    );
  }
}

/**
 * Complete the current phase and activate the next non-skipped one.
 * Marks the workflow done after the final phase and records a memory
 * entry so the transition survives compaction and session restarts.
 * Gate phases (prd, review) deny the advance until options.approve and
 * an evidence note are supplied.
 */
function advanceWorkflow(id, options = {}) {
  const workflow = requireWorkflow(id, options);
  const phase = currentPhase(workflow);
  if (!phase) {
    throw new Error(`Workflow ${id} has no remaining phases`);
  }

  assertGateApproved(workflow, phase, options);

  phase.status = 'done';
  phase.completedAt = nowIso();
  if (options.artifact && !phase.artifacts.includes(options.artifact)) {
    phase.artifacts.push(options.artifact);
  }
  if (options.note) {
    phase.notes.push(options.note);
  }

  const next = workflow.phases.find(entry => entry.status === 'pending');
  if (next) {
    next.status = 'active';
    next.startedAt = nowIso();
  } else {
    workflow.status = 'done';
  }

  saveWorkflow(workflow, options);
  appendMemory(workflow, phase.id, options.note ? `Completed: ${options.note}` : `Phase "${phase.name}" completed`, options);
  return saveWorkflow(workflow, options);
}

function appendMemory(workflow, phaseId, note, options = {}) {
  const entry = { at: nowIso(), phase: phaseId || null, note };
  workflow.memory.push(entry);
  const line = `- ${entry.at}${entry.phase ? ` [${entry.phase}]` : ''} ${note}\n`;
  fs.appendFileSync(memoryPath(workflow.id, options), line);
  return entry;
}

/**
 * Record a business-context memory note for a workflow ("Supermemory has
 * full business context at every layer"). Notes land in both state.json
 * and the human-readable memory.md log.
 */
function addMemory(id, note, options = {}) {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (!trimmed) {
    throw new Error('Memory note is required');
  }
  const workflow = requireWorkflow(id, options);
  const entry = appendMemory(workflow, options.phase, trimmed, options);
  saveWorkflow(workflow, options);
  return entry;
}

/**
 * Bounded plain-text summary of active workflows for SessionStart context
 * injection. Returns '' when there is nothing to report.
 */
function summarizeWorkflows(options = {}) {
  const workflows = listWorkflows(options);
  if (workflows.length === 0) {
    return '';
  }

  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : 2000;
  const lines = ['## Active ECC workflows'];
  for (const workflow of workflows) {
    const phase = currentPhase(workflow);
    const doneCount = workflow.phases.filter(entry => entry.status === 'done').length;
    const lastMemory = workflow.memory[workflow.memory.length - 1];
    let line = `- ${workflow.name} [${workflow.id}] — ${doneCount}/${workflow.phases.length} phases done`;
    if (phase) {
      line += `; current: ${phase.id} (${STAGES[phase.stage].name}${phase.agents.length ? `; agents: ${phase.agents.join(', ')}` : ''})`;
    }
    if (lastMemory) {
      line += `; last note: ${lastMemory.note}`;
    }
    lines.push(line);
  }
  lines.push('Run /workflow status for details, /workflow advance to move to the next phase.');

  const summary = lines.join('\n');
  return summary.length > maxChars ? `${summary.slice(0, maxChars - 12).trimEnd()}\n[truncated]` : summary;
}

module.exports = {
  PHASES,
  STAGES,
  PHASE_STATUSES,
  WORKFLOW_STATUSES,
  resolveWorkflowsDir,
  slugify,
  createWorkflow,
  getWorkflow,
  saveWorkflow,
  listWorkflows,
  currentPhase,
  updatePhase,
  advanceWorkflow,
  addMemory,
  summarizeWorkflows
};
