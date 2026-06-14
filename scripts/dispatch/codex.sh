#!/usr/bin/env bash
# ECC-native Codex dispatch shim (worktree-swarm worker mode).
#
# Usage:
#   bash scripts/dispatch/codex.sh <task-file> <handoff-file> <status-file> [role]
#
# Delegates to the cross-platform Node wrapper. Codex runs read-only and returns
# a Unified Diff Patch / review in the handoff file; Claude applies all edits.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${here}/run.js" codex "$@"
