#!/usr/bin/env node
/**
 * Durable cross-harness session registry for ECC dispatch.
 *
 * Stores SESSION_ID per harness/backend/feature/role so Codex, Gemini,
 * Claude, Cursor, and antigravity-cli lanes can resume after interruption.
 *
 * Usage (library):
 *   const reg = require('./session-registry');
 *   reg.register({ harness: 'codex', backend: 'codex', sessionId, featureId, role, cwd });
 *   reg.getResume({ harness: 'codex', featureId, role });
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REGISTRY_DIR = path.join(os.homedir(), '.claude', 'spec-kit');
let registryFilePath = path.join(REGISTRY_DIR, 'session-registry.json');

function registryFile() {
  return registryFilePath;
}

const VALID_HARNESSES = new Set([
  'claude', 'cursor', 'codex', 'gemini', 'antigravity', 'opencode', 'ecc'
]);

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryFile(), 'utf8'));
  } catch (_) {
    return { version: 1, sessions: [] };
  }
}

function writeRegistry(data) {
  fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
  const next = { ...data, updated: new Date().toISOString() };
  fs.writeFileSync(registryFile(), JSON.stringify(next, null, 2) + '\n');
}

function sessionKey({ harness, backend, featureId, role, slice }) {
  return [harness || backend || 'ecc', featureId || '_global', role || '_default', slice || '_none'].join('::');
}

/**
 * Register or update a dispatch session.
 */
function register(entry) {
  const harness = entry.harness || entry.backend || 'ecc';
  const data = readRegistry();
  const key = sessionKey({
    harness,
    backend: entry.backend,
    featureId: entry.featureId,
    role: entry.role,
    slice: entry.slice
  });
  const record = {
    key,
    harness,
    backend: entry.backend || harness,
    sessionId: entry.sessionId,
    featureId: entry.featureId || null,
    role: entry.role || null,
    slice: entry.slice || null,
    cwd: entry.cwd || process.cwd(),
    taskIds: entry.taskIds || [],
    updated: new Date().toISOString(),
    meta: entry.meta || {}
  };

  const idx = data.sessions.findIndex(s => s.key === key);
  if (idx >= 0) {
    data.sessions[idx] = { ...data.sessions[idx], ...record };
  } else {
    data.sessions.push(record);
  }

  // Cap registry size
  if (data.sessions.length > 500) {
    data.sessions.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    data.sessions = data.sessions.slice(0, 500);
  }

  writeRegistry(data);
  return record;
}

/**
 * Find the latest session id for resume.
 */
function getResume(query) {
  const harness = query.harness || query.backend;
  const key = sessionKey({
    harness,
    backend: query.backend,
    featureId: query.featureId,
    role: query.role,
    slice: query.slice
  });
  const data = readRegistry();
  const exact = data.sessions.find(s => s.key === key);
  if (exact) return exact;

  // Fallback: same harness + feature + role, any slice
  const fallback = data.sessions
    .filter(s =>
      s.harness === (harness || s.harness) &&
      (query.featureId ? s.featureId === query.featureId : true) &&
      (query.role ? s.role === query.role : true)
    )
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  return fallback[0] || null;
}

function listForFeature(featureId) {
  const data = readRegistry();
  return data.sessions
    .filter(s => s.featureId === featureId)
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

function detectHarness() {
  const env = String(process.env.ECC_HARNESS || process.env.CLAUDE_CODE || '').toLowerCase();
  if (env.includes('cursor')) return 'cursor';
  if (process.env.CURSOR_SESSION_ID) return 'cursor';
  if (process.env.CLAUDE_SESSION_ID) return 'claude';
  return 'claude';
}

if (require.main === module) {
  const sub = process.argv[2];
  if (sub === 'list') {
    const featureId = process.argv[3];
    const rows = featureId ? listForFeature(featureId) : readRegistry().sessions;
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  } else {
    process.stderr.write('Usage: session-registry.js list [feature-id]\n');
    process.exit(2);
  }
}

module.exports = {
  get REGISTRY_FILE() { return registryFilePath; },
  set REGISTRY_FILE(p) { registryFilePath = p; },
  REGISTRY_DIR,
  VALID_HARNESSES,
  register,
  getResume,
  listForFeature,
  detectHarness,
  sessionKey
};
