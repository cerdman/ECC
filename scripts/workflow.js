#!/usr/bin/env node
'use strict';

/**
 * workflow.js - CLI for the ai-augmented-workflow state store.
 *
 * Tracks multiple concurrent feature workflows (requirements -> discovery ->
 * PRD -> tech plan -> design -> implement -> test -> review), per-phase agent
 * assignments, artifacts, and a per-workflow memory log under
 * .claude/workflows/ in the current project.
 */

const {
  STAGES,
  createWorkflow,
  getWorkflow,
  listWorkflows,
  currentPhase,
  updatePhase,
  advanceWorkflow,
  addMemory,
  summarizeWorkflows
} = require('./lib/workflow-state');

const VALUE_FLAGS = new Set(['--description', '--status', '--agent', '--artifact', '--note', '--phase', '--dir', '--max-chars']);

function showHelp(exitCode = 0) {
  console.log(`
Usage:
  node scripts/workflow.js start <name> [--description <text>] [--no-design] [--json]
  node scripts/workflow.js list [--all] [--json]
  node scripts/workflow.js show <id> [--json]
  node scripts/workflow.js advance <id> [--artifact <path>] [--note <text>] [--json]
  node scripts/workflow.js set-phase <id> <phase> [--status <s>] [--agent <name>] [--artifact <path>] [--note <text>] [--json]
  node scripts/workflow.js memory <id> --note <text> [--phase <phase>] [--json]
  node scripts/workflow.js summary [--all] [--max-chars <n>]

Track the AI-augmented engineering workflow (requirements, discovery, PRD,
tech plan, design, implement, test, review) across multiple concurrent
features with per-phase agent assignments and a memory log.

Options:
  --description <text>  Workflow description for start
  --no-design           Skip the wireframes/mockups phase (non-UI work)
  --status <s>          Phase status: pending | active | done | skipped
  --agent <name>        Record an agent assignment on a phase (repeatable)
  --artifact <path>     Record an artifact (PRD, plan, mockup, PR, ...)
  --note <text>         Free-text note / memory entry
  --phase <phase>       Phase id to attach a memory note to
  --dir <path>          Override the workflows directory
  --all                 Include finished workflows
  --json                Emit JSON
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const parsed = { positional: [], flags: {}, agents: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined) {
        console.error(`Missing value for ${arg}`);
        process.exit(1);
      }
      if (arg === '--agent') {
        parsed.agents.push(value);
      } else {
        parsed.flags[arg.slice(2)] = value;
      }
      index += 1;
    } else if (arg.startsWith('--')) {
      parsed.flags[arg.slice(2)] = true;
    } else {
      parsed.positional.push(arg);
    }
  }
  return parsed;
}

function storeOptions(parsed) {
  return parsed.flags.dir ? { dir: parsed.flags.dir } : {};
}

function emit(parsed, value, formatter) {
  if (parsed.flags.json) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    formatter(value);
  }
}

function phaseLine(phase) {
  const marker = { done: 'x', active: '>', skipped: '-', pending: ' ' }[phase.status] || ' ';
  const agents = phase.agents.length ? ` agents: ${phase.agents.join(', ')}` : '';
  const artifacts = phase.artifacts.length ? ` artifacts: ${phase.artifacts.join(', ')}` : '';
  return `  [${marker}] ${phase.id} — ${phase.name} (${STAGES[phase.stage].name}, ${STAGES[phase.stage].timeWeight}%)${agents}${artifacts}`;
}

function printWorkflow(workflow) {
  console.log(`${workflow.name} [${workflow.id}] — ${workflow.status}`);
  if (workflow.description) {
    console.log(`  ${workflow.description}`);
  }
  for (const phase of workflow.phases) {
    console.log(phaseLine(phase));
  }
  if (workflow.memory.length > 0) {
    console.log('  memory:');
    for (const entry of workflow.memory.slice(-5)) {
      console.log(`    - ${entry.at}${entry.phase ? ` [${entry.phase}]` : ''} ${entry.note}`);
    }
  }
}

function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === 'help' || command === '--help') {
    showHelp(command ? 0 : 1);
  }

  const parsed = parseArgs(rest);
  const options = storeOptions(parsed);

  try {
    switch (command) {
      case 'start': {
        const name = parsed.positional.join(' ');
        const workflow = createWorkflow(name, {
          ...options,
          description: parsed.flags.description,
          design: parsed.flags['no-design'] ? false : undefined
        });
        emit(parsed, workflow, wf => {
          console.log(`Started workflow ${wf.id}`);
          printWorkflow(wf);
        });
        break;
      }
      case 'list': {
        const workflows = listWorkflows({ ...options, all: Boolean(parsed.flags.all) });
        emit(parsed, workflows, list => {
          if (list.length === 0) {
            console.log('No workflows found. Start one with: node scripts/workflow.js start <name>');
            return;
          }
          for (const workflow of list) {
            const phase = currentPhase(workflow);
            console.log(`${workflow.id} — ${workflow.name} (${workflow.status}${phase ? `, current: ${phase.id}` : ''})`);
          }
        });
        break;
      }
      case 'show': {
        const workflow = getWorkflow(parsed.positional[0] || '', options);
        if (!workflow) {
          console.error(`Workflow not found: ${parsed.positional[0] || '<missing id>'}`);
          process.exit(1);
        }
        emit(parsed, workflow, printWorkflow);
        break;
      }
      case 'advance': {
        const workflow = advanceWorkflow(parsed.positional[0] || '', {
          ...options,
          artifact: parsed.flags.artifact,
          note: parsed.flags.note
        });
        emit(parsed, workflow, wf => {
          const phase = currentPhase(wf);
          console.log(phase ? `Advanced ${wf.id} to phase: ${phase.id}` : `Workflow ${wf.id} is done`);
        });
        break;
      }
      case 'set-phase': {
        const [id, phaseId] = parsed.positional;
        const workflow = updatePhase(id || '', phaseId || '', {
          status: parsed.flags.status,
          agents: parsed.agents,
          artifact: parsed.flags.artifact,
          note: parsed.flags.note
        }, options);
        emit(parsed, workflow, printWorkflow);
        break;
      }
      case 'memory': {
        const note = parsed.flags.note || parsed.positional.slice(1).join(' ');
        const entry = addMemory(parsed.positional[0] || '', note, { ...options, phase: parsed.flags.phase });
        emit(parsed, entry, value => console.log(`Recorded memory on ${parsed.positional[0]}: ${value.note}`));
        break;
      }
      case 'summary': {
        const summary = summarizeWorkflows({
          ...options,
          all: Boolean(parsed.flags.all),
          maxChars: parsed.flags['max-chars'] ? Number(parsed.flags['max-chars']) : undefined
        });
        console.log(summary || 'No active workflows.');
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        showHelp(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
