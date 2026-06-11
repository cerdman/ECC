#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook: inject active ai-augmented-workflow state into context.
 *
 * Reads .claude/workflows/ in the session's project directory and emits a
 * bounded summary of active workflows (current phase, assigned agents, last
 * memory note) so multi-session feature work resumes with full pipeline
 * context. Silent when no workflows exist.
 *
 * Opt out with ECC_WORKFLOW_CONTEXT=off; bound output with
 * ECC_WORKFLOW_CONTEXT_MAX_CHARS (default 2000).
 */

const { summarizeWorkflows } = require('../lib/workflow-state');

const DEFAULT_MAX_CHARS = 2000;

function resolveMaxChars() {
  const raw = process.env.ECC_WORKFLOW_CONTEXT_MAX_CHARS;
  if (raw === undefined || raw === '') {
    return DEFAULT_MAX_CHARS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_CHARS;
}

function run(rawInput) {
  try {
    if ((process.env.ECC_WORKFLOW_CONTEXT || '').toLowerCase() === 'off') {
      return { stdout: '' };
    }

    const maxChars = resolveMaxChars();
    if (maxChars === 0) {
      return { stdout: '' };
    }

    let cwd = process.cwd();
    try {
      const input = JSON.parse(rawInput);
      if (input && typeof input.cwd === 'string' && input.cwd.trim()) {
        cwd = input.cwd;
      }
    } catch (_error) {
      // Non-JSON stdin: fall back to process.cwd()
    }

    return { stdout: summarizeWorkflows({ cwd, maxChars }) };
  } catch (error) {
    return { stdout: '', stderr: `[WorkflowContext] ${error.message}` };
  }
}

module.exports = { run };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    const output = run(raw);
    if (output.stderr) process.stderr.write(`${output.stderr}\n`);
    process.stdout.write(output.stdout || '');
    process.exit(0);
  });
}
