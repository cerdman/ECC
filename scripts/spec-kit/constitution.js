#!/usr/bin/env node
/**
 * Constitution resolution and scaffolding for the spec-driven workflow.
 *
 * Usage:
 *   node scripts/spec-kit/constitution.js resolve <file-or-dir> [--json]
 *   node scripts/spec-kit/constitution.js scaffold repo|technical|path [--dir <dir>] [--json]
 *   node scripts/spec-kit/constitution.js list [--json]
 *
 * Constitution layers (most specific wins for path rules; all are checked at verify):
 *   1. Repo:        .specify/memory/constitution.md
 *   2. Technical:   .specify/memory/technical-constitution.md
 *   3. Path-scoped: CONSTITUTION.md or .specify/constitution.md in any ancestor of the target path
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const TECHNICAL_REL = path.join('.specify', 'memory', 'technical-constitution.md');
const PATH_CONST_NAMES = ['CONSTITUTION.md', path.join('.specify', 'constitution.md')];

function parseArgs(argv) {
  const args = { _: [], json: false, dir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--dir') args.dir = argv[++i];
    else args._.push(a);
  }
  return args;
}

function constitutionEntry(repoRoot, relPath, layer) {
  const abs = path.join(repoRoot, relPath);
  const exists = fs.existsSync(abs);
  return {
    layer,
    path: relPath.split(path.sep).join('/'),
    abs,
    exists,
    content: exists ? lib.readFileSafe(abs) : null
  };
}

/**
 * Walk from target path up to repo root; collect path-scoped constitutions.
 */
function pathScopedConstitutions(repoRoot, targetPath) {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(repoRoot);
  let dir = fs.existsSync(resolved) && fs.statSync(resolved).isFile()
    ? path.dirname(resolved)
    : resolved;

  const entries = [];
  const seen = new Set();

  while (dir.startsWith(root) || dir === root) {
    for (const name of PATH_CONST_NAMES) {
      const rel = path.relative(root, path.join(dir, name));
      if (rel.startsWith('..')) break;
      const key = rel.split(path.sep).join('/');
      if (seen.has(key)) continue;
      const entry = constitutionEntry(root, rel, 'path');
      if (entry.exists) {
        seen.add(key);
        entries.push(entry);
      }
    }
    if (dir === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return entries.sort((a, b) => a.path.length - b.path.length);
}

/**
 * Resolve all applicable constitutions for a file or directory.
 */
function resolveConstitutions(repoRoot, targetPath) {
  const root = repoRoot || lib.findRepoRoot();
  const repo = constitutionEntry(root, lib.CONSTITUTION_REL, 'repo');
  const technical = constitutionEntry(root, TECHNICAL_REL, 'technical');
  const pathScoped = pathScopedConstitutions(root, targetPath || root);

  const applicable = [];
  if (repo.exists) applicable.push(repo);
  if (technical.exists) applicable.push(technical);
  applicable.push(...pathScoped);

  return {
    repoRoot: root,
    target: targetPath ? path.resolve(targetPath) : root,
    repo,
    technical,
    pathScoped,
    applicable,
    missing: [
      !repo.exists ? lib.CONSTITUTION_REL : null,
      !technical.exists ? TECHNICAL_REL : null
    ].filter(Boolean)
  };
}

function scaffold(kind, options = {}) {
  const repoRoot = options.repoRoot || lib.findRepoRoot();
  lib.ensureDir(path.join(repoRoot, '.specify', 'memory'));

  if (kind === 'repo') {
    const dest = path.join(repoRoot, lib.CONSTITUTION_REL);
    if (!fs.existsSync(dest)) {
      const tpl = lib.readFileSafe(path.join(lib.TEMPLATE_DIR, 'constitution.md')) || '# Constitution\n';
      fs.writeFileSync(dest, tpl);
    }
    return { kind, path: dest, created: true };
  }

  if (kind === 'technical') {
    const dest = path.join(repoRoot, TECHNICAL_REL);
    if (!fs.existsSync(dest)) {
      const tpl = lib.readFileSafe(path.join(lib.TEMPLATE_DIR, 'technical-constitution.md')) || '# Technical Constitution\n';
      fs.writeFileSync(dest, tpl);
    }
    return { kind, path: dest, created: true };
  }

  if (kind === 'path') {
    const dir = options.dir ? path.resolve(options.dir) : repoRoot;
    const dest = path.join(dir, 'CONSTITUTION.md');
    lib.ensureDir(dir);
    if (!fs.existsSync(dest)) {
      const tpl = lib.readFileSafe(path.join(lib.TEMPLATE_DIR, 'path-constitution.md')) || '# Path Constitution\n';
      fs.writeFileSync(dest, tpl);
    }
    return { kind, path: dest, created: true };
  }

  throw new Error(`unknown scaffold kind: ${kind}`);
}

function listAll(repoRoot) {
  const root = repoRoot || lib.findRepoRoot();
  const found = [];

  const repo = path.join(root, lib.CONSTITUTION_REL);
  if (fs.existsSync(repo)) found.push({ layer: 'repo', path: lib.CONSTITUTION_REL });

  const tech = path.join(root, TECHNICAL_REL);
  if (fs.existsSync(tech)) found.push({ layer: 'technical', path: TECHNICAL_REL });

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'target') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name === 'CONSTITUTION.md') {
        found.push({
          layer: 'path',
          path: path.relative(root, full).split(path.sep).join('/')
        });
      }
    }
  }
  walk(root);
  return found;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sub = args._[0];
  const repoRoot = lib.findRepoRoot();

  let payload;
  if (sub === 'resolve') {
    const target = args._[1] || repoRoot;
    payload = resolveConstitutions(repoRoot, target);
  } else if (sub === 'scaffold') {
    const kind = args._[1];
    if (!kind) {
      process.stderr.write('Usage: constitution.js scaffold repo|technical|path [--dir <dir>]\n');
      process.exit(2);
    }
    payload = scaffold(kind, { repoRoot, dir: args.dir });
  } else if (sub === 'list') {
    payload = { constitutions: listAll(repoRoot) };
  } else {
    process.stderr.write('Usage: constitution.js resolve <path> | scaffold <kind> | list [--json]\n');
    process.exit(2);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else if (sub === 'resolve') {
    process.stdout.write(`Applicable constitutions for ${payload.target}:\n`);
    for (const c of payload.applicable) {
      process.stdout.write(`  [${c.layer}] ${c.path}\n`);
    }
    if (payload.missing.length) {
      process.stdout.write(`Missing (optional): ${payload.missing.join(', ')}\n`);
    }
  } else if (sub === 'list') {
    for (const c of payload.constitutions) {
      process.stdout.write(`[${c.layer}] ${c.path}\n`);
    }
  } else {
    process.stdout.write(`Scaffolded ${payload.kind} -> ${payload.path}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  TECHNICAL_REL,
  PATH_CONST_NAMES,
  resolveConstitutions,
  pathScopedConstitutions,
  scaffold,
  listAll
};
