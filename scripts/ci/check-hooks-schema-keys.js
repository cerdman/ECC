#!/usr/bin/env node
/**
 * Fail when a shipped hooks config carries keys outside its loader's
 * documented set.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HOOKS_FILE = process.env.HOOKS_FILE || path.join(__dirname, '../../hooks/hooks.json');
const CODEX_HOOKS_FILE = process.env.CODEX_HOOKS_FILE || path.join(__dirname, '../../hooks/codex-hooks.json');

const LOADER_KEY_SETS = [
  {
    label: 'Claude Code',
    file: HOOKS_FILE,
    rootKeys: ['hooks'],
    groupKeys: ['matcher', 'hooks'],
    handlerKeys: [
      'type', 'command', 'timeout', 'statusMessage', 'async',
      'url', 'headers', 'allowedEnvVars', 'prompt', 'model',
    ],
  },
  {
    label: 'Codex',
    file: CODEX_HOOKS_FILE,
    rootKeys: ['description', 'hooks'],
    groupKeys: ['matcher', 'hooks', 'id', 'description'],
    handlerKeys: ['type', 'command', 'timeout'],
  },
];

function findUnknownKeys(data, keySet) {
  const findings = [];
  const fileLabel = path.basename(keySet.file);

  for (const key of Object.keys(data)) {
    if (!keySet.rootKeys.includes(key)) {
      findings.push(`${fileLabel}: root key "${key}" is not in the ${keySet.label} documented set`);
    }
  }

  const events = data.hooks && typeof data.hooks === 'object' && !Array.isArray(data.hooks)
    ? data.hooks
    : {};
  for (const [eventType, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, groupIndex) => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) return;
      for (const key of Object.keys(group)) {
        if (!keySet.groupKeys.includes(key)) {
          findings.push(
            `${fileLabel}: ${eventType}[${groupIndex}] key "${key}" is not in the ${keySet.label} documented set`
          );
        }
      }

      if (!Array.isArray(group.hooks)) return;
      group.hooks.forEach((handler, handlerIndex) => {
        if (!handler || typeof handler !== 'object' || Array.isArray(handler)) return;
        for (const key of Object.keys(handler)) {
          if (!keySet.handlerKeys.includes(key)) {
            findings.push(
              `${fileLabel}: ${eventType}[${groupIndex}].hooks[${handlerIndex}] key "${key}" `
              + `is not in the ${keySet.label} documented set`
            );
          }
        }
      });
    });
  }

  return findings;
}

function checkHooksSchemaKeys() {
  const findings = [];
  let checked = 0;

  for (const keySet of LOADER_KEY_SETS) {
    if (!fs.existsSync(keySet.file)) {
      console.log(`No ${path.basename(keySet.file)} found, skipping ${keySet.label} key check`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(fs.readFileSync(keySet.file, 'utf8'));
    } catch (error) {
      console.error(`ERROR: Invalid JSON in ${keySet.file}: ${error.message}`);
      findings.push('invalid JSON');
      continue;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.error(`ERROR: ${keySet.file} must contain a JSON object`);
      findings.push('not an object');
      continue;
    }

    checked += 1;
    findings.push(...findUnknownKeys(data, keySet));
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      if (!finding.startsWith('invalid') && finding !== 'not an object') {
        console.error(`ERROR: ${finding}`);
      }
    }
    console.error(`\n${findings.length} key(s) outside the documented loader set`);
    process.exit(1);
  }

  console.log(`Checked ${checked} hooks config(s): all keys within the documented loader sets`);
}

checkHooksSchemaKeys();
