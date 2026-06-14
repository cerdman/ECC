#!/usr/bin/env node
/**
 * Stop Hook: Kiro-style post-implementation verification.
 *
 * After the agent finishes a turn (Stop), runs independent checks:
 * constitution stack, tests, and Codex review gate — then injects the report
 * as additionalContext so the user sees it before continuing.
 *
 * Disable: ECC_SPEC_VERIFY=off or ECC_DISABLED_HOOKS containing spec-implementation-verify
 */

'use strict';

const verifyImpl = require('../spec-kit/verify-implementation');
const accumulator = require('./spec-implementation-accumulator');

const MAX_STDIN = 1024 * 1024;
const OFF_VALUES = new Set(['0', 'false', 'off', 'disabled', 'no']);

function isDisabled() {
  const flag = String(process.env.ECC_SPEC_VERIFY || '').trim().toLowerCase();
  if (OFF_VALUES.has(flag)) return true;
  return String(process.env.ECC_DISABLED_HOOKS || '').includes('spec-implementation-verify');
}

function run(rawInput) {
  if (isDisabled()) return rawInput;

  let input;
  try {
    input = rawInput.trim() ? JSON.parse(rawInput) : {};
  } catch (_) {
    return rawInput;
  }

  const batch = accumulator.readBatch();
  if (!batch.files || batch.files.length === 0) {
    return rawInput;
  }

  try {
    const verdict = verifyImpl.verify({
      codex: String(process.env.ECC_SPEC_VERIFY_CODEX || '1') !== '0'
    });
    if (verdict.skipped) return rawInput;

    const report = verifyImpl.formatReport(verdict);
    verifyImpl.clearBatch();

    if (!report) return rawInput;

    // Surface to user via stderr (always) and Stop additionalContext when supported.
    process.stderr.write(`\n[spec-implementation-verify] ${verdict.pass ? 'PASS' : 'FAIL'}\n`);

    const output = {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: report
      }
    };
    return JSON.stringify(output);
  } catch (err) {
    process.stderr.write(`[spec-implementation-verify] error: ${err.message}\n`);
    return rawInput;
  }
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
  });
  process.stdin.on('end', () => {
    const out = run(data);
    if (out) process.stdout.write(out);
    process.exit(0);
  });
}

module.exports = { run };
