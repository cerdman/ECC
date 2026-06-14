#!/usr/bin/env node
/**
 * ECC-native multi-agent dispatch wrapper.
 *
 * Replaces the external `ccg-workflow` `codeagent-wrapper`. Dispatches a task to
 * a read-only advisor backend (Codex or Gemini), captures its output, and
 * manages a SESSION_ID for resume. External agents NEVER write to disk — they
 * return text (Unified Diff Patches / reviews); Claude remains the sole writer.
 *
 * Two modes:
 *
 * 1. Advisor / stdin mode (codeagent-wrapper compatible):
 *      node scripts/dispatch/run.js --backend <codex|gemini> [--gemini-model M]
 *           [--lite] [resume <SESSION_ID>] - "<CWD>" <<'EOF'
 *      ROLE_FILE: scripts/dispatch/prompts/codex/architect.md
 *      <TASK> ... </TASK>
 *      OUTPUT: Unified Diff Patch ONLY.
 *      EOF
 *
 * 2. File / worker mode (for worktree swarm launchers):
 *      node scripts/dispatch/run.js <codex|gemini> <task-file> <handoff-file> <status-file> [role]
 *
 * Env overrides: ECC_CODEX_MODEL, ECC_GEMINI_MODEL, ECC_CODEX_SANDBOX (default
 * read-only), ECC_DISPATCH_DRYRUN (1 = echo the prompt instead of invoking).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const sessionRegistry = require('./session-registry');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'spec-kit', 'sessions');

function uuid() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function timestamp() {
  return new Date().toISOString();
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function defaultModel(backend, lite) {
  if (backend === 'gemini') {
    return process.env[lite ? 'ECC_GEMINI_MODEL_LITE' : 'ECC_GEMINI_MODEL'] || 'gemini-3-pro-preview';
  }
  return process.env[lite ? 'ECC_CODEX_MODEL_LITE' : 'ECC_CODEX_MODEL'] || 'gpt-5.4';
}

function loadSession(sessionId) {
  if (!sessionId) return null;
  const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveSession(session) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SESSIONS_DIR, `${session.id}.json`), JSON.stringify(session, null, 2) + '\n');
}

/**
 * Build the final prompt: optional ROLE_FILE contents + the task body, plus any
 * prior transcript when resuming a session.
 */
function buildPrompt(rawTask, cwd, priorTranscript) {
  let role = '';
  let body = rawTask;
  const roleMatch = rawTask.match(/^\s*ROLE_FILE:\s*(.+?)\s*$/m);
  if (roleMatch) {
    const rolePath = path.resolve(cwd, roleMatch[1].trim());
    try {
      role = fs.readFileSync(rolePath, 'utf8');
    } catch (_) {
      role = `# (role file not found: ${roleMatch[1].trim()})`;
    }
    body = rawTask.replace(roleMatch[0], '').trim();
  }
  const parts = [];
  if (role) parts.push(role.trim());
  if (priorTranscript) {
    parts.push('## Prior session context\n' + priorTranscript.trim());
  }
  parts.push(body.trim());
  return parts.join('\n\n---\n\n');
}

function invokeCodex(prompt, cwd) {
  if (process.env.ECC_DISPATCH_DRYRUN === '1') {
    return { ok: true, output: `[dryrun codex]\n${prompt.slice(0, 400)}` };
  }
  const sandbox = process.env.ECC_CODEX_SANDBOX || 'read-only';
  const model = defaultModel('codex', false);
  const outFile = path.join(os.tmpdir(), `ecc-codex-${uuid()}.txt`);
  const args = ['exec', '-s', sandbox, '-m', model, '--color', 'never', '-C', cwd, '-o', outFile, '-'];
  const res = spawnSync('codex', args, { input: prompt, encoding: 'utf8', timeout: 3600000 });
  if (res.error) {
    return { ok: false, output: `Codex CLI not available: ${res.error.message}`, missing: res.error.code === 'ENOENT' };
  }
  let output = '';
  try { output = fs.readFileSync(outFile, 'utf8'); } catch (_) { output = res.stdout || ''; }
  try { fs.unlinkSync(outFile); } catch (_) { /* ignore */ }
  return { ok: res.status === 0, output: output || res.stdout || res.stderr || '' };
}

function invokeGemini(prompt, cwd) {
  if (process.env.ECC_DISPATCH_DRYRUN === '1') {
    return { ok: true, output: `[dryrun gemini]\n${prompt.slice(0, 400)}` };
  }
  const model = defaultModel('gemini', false);
  const res = spawnSync('gemini', ['-m', model], { input: prompt, encoding: 'utf8', cwd, timeout: 3600000 });
  if (res.error) {
    return { ok: false, output: `Gemini CLI not available: ${res.error.message}`, missing: res.error.code === 'ENOENT' };
  }
  return { ok: res.status === 0, output: res.stdout || res.stderr || '' };
}

function dispatch(backend, prompt, cwd) {
  return backend === 'gemini' ? invokeGemini(prompt, cwd) : invokeCodex(prompt, cwd);
}

// --- Argument parsing --------------------------------------------------------

function parseAdvisorArgs(argv) {
  const args = { backend: null, geminiModel: null, lite: false, resume: null, cwd: process.cwd() };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--backend') args.backend = argv[++i];
    else if (a === '--gemini-model') args.geminiModel = argv[++i];
    else if (a === '--lite') args.lite = true;
    else if (a === 'resume') args.resume = argv[++i];
    else if (a === '-') positionals.push('-');
    else positionals.push(a);
  }
  // Last non-dash positional is the working dir.
  const cwdCandidate = positionals.filter(p => p !== '-').pop();
  if (cwdCandidate) args.cwd = cwdCandidate;
  return args;
}

function runAdvisorMode(argv) {
  const args = parseAdvisorArgs(argv);
  if (!args.backend) {
    process.stderr.write('Error: --backend <codex|gemini> is required\n');
    process.exit(2);
  }
  const rawTask = readStdin();
  const prior = loadSession(args.resume);
  const sessionId = args.resume || uuid();
  const prompt = buildPrompt(rawTask, args.cwd, prior ? prior.output : null);

  const result = dispatch(args.backend, prompt, args.cwd);

  saveSession({
    id: sessionId,
    backend: args.backend,
    cwd: args.cwd,
    updated: timestamp(),
    prompt,
    output: result.output
  });

  sessionRegistry.register({
    harness: process.env.ECC_HARNESS || sessionRegistry.detectHarness(),
    backend: args.backend,
    sessionId,
    role: (rawTask.match(/ROLE_FILE:.*\/(\w+)\.md/) || [])[1] || null,
    featureId: process.env.ECC_SPEC_FEATURE || null,
    cwd: args.cwd,
    meta: { mode: 'advisor', resume: Boolean(args.resume) }
  });

  process.stdout.write(result.output + '\n');
  process.stdout.write(`\nSESSION_ID: ${sessionId}\n`);
  if (!result.ok) {
    process.stderr.write(result.missing ? `\n[dispatch] ${args.backend} CLI not found on PATH.\n` : `\n[dispatch] ${args.backend} returned a non-zero status.\n`);
    process.exit(1);
  }
}

function runFileMode(argv) {
  const [backend, taskFile, handoffFile, statusFile, role] = argv;
  if (!backend || !taskFile || !handoffFile || !statusFile) {
    process.stderr.write('Usage: run.js <codex|gemini> <task-file> <handoff-file> <status-file> [role]\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  fs.mkdirSync(path.dirname(handoffFile), { recursive: true });
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });

  const writeStatus = (state, details) => {
    fs.writeFileSync(statusFile, `# Status\n\n- State: ${state}\n- Updated: ${timestamp()}\n- Backend: ${backend}\n- Worktree: \`${cwd}\`\n\n${details}\n`);
  };

  let task;
  try {
    task = fs.readFileSync(taskFile, 'utf8');
  } catch (_) {
    writeStatus('failed', `- Error: task file missing (\`${taskFile}\`)`);
    fs.writeFileSync(handoffFile, `# Handoff\n\n- Failed: ${timestamp()}\n\nTask file is missing or unreadable: \`${taskFile}\`\n`);
    process.exit(1);
  }

  writeStatus('running', `- Task file: \`${taskFile}\``);
  const roleLine = role ? `ROLE_FILE: scripts/dispatch/prompts/${backend}/${role}.md\n` : '';
  const prompt = buildPrompt(`${roleLine}${task}`, cwd, null);
  const result = dispatch(backend, prompt, cwd);
  const sessionId = uuid();
  saveSession({ id: sessionId, backend, cwd, updated: timestamp(), prompt, output: result.output });

  sessionRegistry.register({
    harness: process.env.ECC_HARNESS || sessionRegistry.detectHarness(),
    backend,
    sessionId,
    role: role || null,
    featureId: process.env.ECC_SPEC_FEATURE || null,
    cwd,
    meta: { mode: 'file', taskFile }
  });

  if (result.ok) {
    fs.writeFileSync(handoffFile, `# Handoff\n\n- Completed: ${timestamp()}\n- Backend: ${backend}\n- Worktree: \`${cwd}\`\n- SESSION_ID: ${sessionId}\n\n${result.output}\n`);
    writeStatus('completed', `- Handoff file: \`${handoffFile}\``);
  } else {
    fs.writeFileSync(handoffFile, `# Handoff\n\n- Failed: ${timestamp()}\n- Backend: ${backend}\n\n${result.output}\n`);
    writeStatus('failed', `- Handoff file: \`${handoffFile}\``);
    process.exit(1);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--backend')) {
    runAdvisorMode(argv);
  } else {
    runFileMode(argv);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseAdvisorArgs, buildPrompt, defaultModel };
