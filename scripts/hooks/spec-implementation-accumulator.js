#!/usr/bin/env node
/**
 * PostToolUse Hook: accumulate governed implementation edits for Stop-time verify.
 *
 * Records files edited under an approved spec feature into a session batch file.
 * Consumed by spec-implementation-verify.js on Stop.
 *
 * Disable: ECC_SPEC_VERIFY=off or ECC_DISABLED_HOOKS containing spec-impl-accumulator
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../spec-kit/lib');

const MAX_STDIN = 1024 * 1024;
const OFF_VALUES = new Set(['0', 'false', 'off', 'disabled', 'no']);

function isDisabled() {
  const flag = String(process.env.ECC_SPEC_VERIFY || '').trim().toLowerCase();
  if (OFF_VALUES.has(flag)) return true;
  return String(process.env.ECC_DISABLED_HOOKS || '').includes('spec-impl-accumulator');
}

function sessionId() {
  const raw = process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function batchFile() {
  return path.join(os.homedir(), '.claude', 'spec-kit', `impl-batch-${sessionId()}.json`);
}

function readBatch() {
  try {
    return JSON.parse(fs.readFileSync(batchFile(), 'utf8'));
  } catch (_) {
    return { session: sessionId(), files: [], features: {}, updated: null };
  }
}

function writeBatch(batch) {
  fs.mkdirSync(path.dirname(batchFile()), { recursive: true });
  batch.updated = new Date().toISOString();
  fs.writeFileSync(batchFile(), JSON.stringify(batch, null, 2) + '\n');
}

function recordFile(batch, repoRoot, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const norm = path.resolve(filePath);
  const rel = path.relative(repoRoot, norm).split(path.sep).join('/');
  if (rel.startsWith('..') || rel.includes('/specs/') || rel.includes('/.specify/')) return;

  const feature = lib.findGoverningFeature(repoRoot, norm);
  if (!feature) return;
  const approved = feature.state.gate && feature.state.gate.confirm === 'approved';
  if (!approved || !feature.state.active) return;

  const tasks = lib.taskIdsForFile(feature.tasksText, repoRoot, norm);
  if (!batch.files.includes(rel)) batch.files.push(rel);

  const fid = feature.featureId;
  if (!batch.features[fid]) {
    batch.features[fid] = {
      featureDir: path.relative(repoRoot, feature.dir).split(path.sep).join('/'),
      tasks: []
    };
  }
  for (const t of tasks) {
    if (!batch.features[fid].tasks.find(x => x.id === t.id)) {
      batch.features[fid].tasks.push(t);
    }
  }
}

function run(rawInput) {
  if (isDisabled()) return rawInput;

  let data;
  try {
    data = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch (_) {
    return rawInput;
  }

  const tool = String(data.tool_name || '').toLowerCase();
  if (!['edit', 'write', 'multiedit'].includes(tool)) return rawInput;

  try {
    const repoRoot = lib.findRepoRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
    const batch = readBatch();
    const input = data.tool_input || {};

    if (tool === 'multiedit') {
      for (const e of input.edits || []) recordFile(batch, repoRoot, e.file_path);
    } else {
      recordFile(batch, repoRoot, input.file_path);
    }
    writeBatch(batch);
  } catch (_) {
    // never block
  }

  return rawInput;
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { if (data.length < MAX_STDIN) data += c; });
  process.stdin.on('end', () => {
    process.stdout.write(run(data));
    process.exit(0);
  });
}

module.exports = { run, batchFile, readBatch, writeBatch, recordFile };
