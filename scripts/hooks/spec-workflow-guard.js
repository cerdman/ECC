#!/usr/bin/env node
/**
 * PreToolUse Hook: Spec Workflow Guard
 *
 * Keeps spec-driven-workflow implementation inside the approved plan. For a file
 * that a feature's tasks.md explicitly governs, this hook DENIES edits until that
 * feature's phase-8 confirmation gate is approved (constitution + spec + design +
 * tasks present and gate.confirm === "approved"). After approval it allows the
 * edit, and warns if the file only maps to already-completed tasks.
 *
 * Scope is intentionally narrow: a file is only governed when it is referenced by
 * some `specs/<id>/tasks.md`. Files outside any feature plan (normal repo work,
 * the spec docs themselves, .specify/) are always allowed — the guard is inert
 * for everything it does not explicitly govern.
 *
 * Disable via ECC_SPEC_GUARD=off or ECC_DISABLED_HOOKS containing
 * `pre:edit-write:spec-workflow-guard` / `pre:bash:spec-workflow-guard`.
 *
 * Compatible with run-with-flags.js via module.exports.run(). Cross-platform.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let lib = null;
try {
  lib = require('../spec-kit/lib');
} catch (_) {
  lib = null;
}

const EDIT_WRITE_HOOK_ID = 'pre:edit-write:spec-workflow-guard';
const BASH_HOOK_ID = 'pre:bash:spec-workflow-guard';
const OFF_VALUES = new Set(['0', 'false', 'off', 'disabled', 'disable', 'no']);

function isDisabled() {
  const flag = String(process.env.ECC_SPEC_GUARD || '').trim().toLowerCase();
  if (OFF_VALUES.has(flag)) return true;
  const disabled = String(process.env.ECC_DISABLED_HOOKS || '');
  return disabled.includes('spec-workflow-guard');
}

function projectRoot() {
  const base = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (lib && typeof lib.findRepoRoot === 'function') {
    try { return lib.findRepoRoot(base); } catch (_) { /* ignore */ }
  }
  return base;
}

function normalize(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}

function featureDirs(root) {
  if (lib && typeof lib.listFeatureDirs === 'function') {
    try { return lib.listFeatureDirs(root); } catch (_) { /* ignore */ }
  }
  const dir = path.join(root, 'specs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d{3,}-/.test(e.name))
    .map(e => path.join(dir, e.name));
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

/**
 * Find the feature (if any) whose tasks.md references the target file.
 * Returns { dir, state, tasksText, doneRefsOnly } or null.
 */
function governingFeature(root, targetFile) {
  const relTarget = normalize(path.relative(root, path.resolve(targetFile)));
  const baseTarget = normalize(path.basename(targetFile));
  if (!relTarget || relTarget.startsWith('..')) {
    // Outside the repo — not governed.
    return null;
  }
  for (const dir of featureDirs(root)) {
    const tasksText = readText(path.join(dir, 'tasks.md'));
    if (!tasksText) continue;
    const haystack = normalize(tasksText);
    // Governed if the relative path or a distinctive basename appears in tasks.md.
    const referenced = haystack.includes(relTarget) ||
      (baseTarget.length > 3 && haystack.includes('/' + baseTarget)) ||
      (baseTarget.length > 3 && haystack.includes(' ' + baseTarget));
    if (referenced) {
      const state = readJson(path.join(dir, '.state.json')) || {};
      return { dir, state, tasksText };
    }
  }
  return null;
}

function prerequisitesPresent(root, dir) {
  return fs.existsSync(path.join(dir, 'spec.md')) &&
    fs.existsSync(path.join(dir, 'design.md')) &&
    fs.existsSync(path.join(dir, 'tasks.md')) &&
    fs.existsSync(path.join(root, '.specify', 'memory', 'constitution.md'));
}

function fileMapsToOpenTask(tasksText, root, targetFile) {
  if (!lib || typeof lib.parseTasks !== 'function') return true;
  const relTarget = normalize(path.relative(root, path.resolve(targetFile)));
  const baseTarget = normalize(path.basename(targetFile));
  const { tasks } = lib.parseTasks(tasksText);
  const matching = tasks.filter(t => {
    const d = normalize(t.description);
    return d.includes(relTarget) || (baseTarget.length > 3 && d.includes(baseTarget));
  });
  if (matching.length === 0) return true; // referenced elsewhere; don't over-block
  return matching.some(t => !t.done);
}

function denyResult(reason) {
  return {
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      }
    }),
    exitCode: 0
  };
}

function warnAllow(message) {
  return { stderr: message, exitCode: 0 };
}

function featureId(feature) {
  return (feature.state && feature.state.feature) || path.basename(feature.dir);
}

function guardEdit(root, targetFile, rawInput) {
  if (!targetFile) return rawInput;
  const norm = normalize(targetFile);
  // Always allow writing the spec system itself.
  if (norm.includes('/specs/') || norm.includes('/.specify/')) return rawInput;

  const feature = governingFeature(root, targetFile);
  if (!feature) return rawInput; // not part of any feature plan — inert

  const id = featureId(feature);
  const approved = feature.state && feature.state.gate && feature.state.gate.confirm === 'approved';

  if (!prerequisitesPresent(root, feature.dir)) {
    return denyResult([
      `[Spec Workflow Guard] ${path.basename(targetFile)} is governed by spec feature "${id}", whose spec chain is incomplete.`,
      'Complete constitution + spec.md + design.md + tasks.md before implementing.',
      `Disable with ECC_SPEC_GUARD=off if this is intentional.`
    ].join('\n'));
  }

  if (!approved) {
    return denyResult([
      `[Spec Workflow Guard] "${path.basename(targetFile)}" maps to a task in spec feature "${id}", which is NOT yet approved.`,
      'Run `/spec analyze` (cross-artifact audit + Codex review gate) and get explicit user confirmation.',
      'On approval the workflow sets gate.confirm = "approved" and active = true in the feature .state.json, which unblocks implementation.',
      'Disable with ECC_SPEC_GUARD=off or ECC_DISABLED_HOOKS=pre:edit-write:spec-workflow-guard.'
    ].join('\n'));
  }

  if (!fileMapsToOpenTask(feature.tasksText, root, targetFile)) {
    return warnAllow(`[Spec Workflow Guard] ${path.basename(targetFile)} maps only to completed tasks in "${id}". Re-open or add a task if this is new work.`);
  }

  return rawInput; // approved + active task — allow
}

function guardBash(root, command, rawInput) {
  if (!command) return rawInput;
  // Only consider commands that plausibly mutate files.
  if (!/(>>?|\btee\b|\bsed\b\s+-i|\bcp\b|\bmv\b|\bdd\b|\b> )/.test(command)) {
    // also catch common write tools without redirect
    if (!/\b(sed|tee|cp|mv|install)\b/.test(command)) return rawInput;
  }
  // Check each governed feature: if an unapproved feature's tasks reference a
  // path that appears in the command, block.
  for (const dir of featureDirs(root)) {
    const tasksText = readText(path.join(dir, 'tasks.md'));
    if (!tasksText) continue;
    const state = readJson(path.join(dir, '.state.json')) || {};
    const approved = state.gate && state.gate.confirm === 'approved';
    if (approved) continue;
    if (!prerequisitesPresent(root, dir)) continue;
    // Extract candidate file paths from tasks.md and see if the command mentions one.
    const paths = (tasksText.match(/[\w./-]+\.[A-Za-z0-9]{1,5}/g) || [])
      .filter(p => p.includes('/') || p.includes('.'));
    const normCmd = normalize(command);
    const hit = paths.find(p => normCmd.includes(normalize(p)) && !normalize(p).startsWith('specs/'));
    if (hit) {
      const id = state.feature || path.basename(dir);
      return denyResult([
        `[Spec Workflow Guard] This command writes "${hit}", governed by unapproved spec feature "${id}".`,
        'Get phase-8 confirmation (`/spec analyze`) before implementing. Disable with ECC_SPEC_GUARD=off.'
      ].join('\n'));
    }
  }
  return rawInput;
}

function run(rawInput) {
  let data;
  try {
    data = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch (_) {
    return rawInput; // allow on parse error
  }

  if (isDisabled()) return rawInput;

  const root = projectRoot();
  const rawToolName = (data.tool_name || '').toLowerCase();
  const toolInput = data.tool_input || {};

  try {
    if (rawToolName === 'edit' || rawToolName === 'write') {
      return guardEdit(root, toolInput.file_path || '', rawInput);
    }
    if (rawToolName === 'multiedit') {
      const edits = toolInput.edits || [];
      for (const edit of edits) {
        const result = guardEdit(root, edit.file_path || '', rawInput);
        if (result !== rawInput && result && result.stdout) return result; // first denial wins
      }
      return rawInput;
    }
    if (rawToolName === 'bash') {
      return guardBash(root, toolInput.command || '', rawInput);
    }
  } catch (_) {
    return rawInput; // never crash tool execution
  }

  return rawInput;
}

module.exports = { run, governingFeature, guardEdit, guardBash };
