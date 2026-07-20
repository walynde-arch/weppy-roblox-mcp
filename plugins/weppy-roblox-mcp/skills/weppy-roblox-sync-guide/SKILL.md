---
name: weppy-roblox-sync-guide
description: Use when working with NovaMCP Roblox MCP Studio-local sync, bidirectional file mirrors, sync directions, multi-place project folders, conflicts, reverse apply and delete safety, sourcemaps, detector recovery, or Roblox Explorer context.
---

# NovaMCP Roblox Sync Guide

## Overview

Use this skill when local files and Roblox Studio state must stay aligned through NovaMCP sync. Load only the reference that matches the sync problem.

## Workflow

1. Inspect current place and sync status before changing files or directions.
2. Confirm the intended direction model: `forward`, `reverse`, or `bidirectional`.
3. Use the v2 nested directory format when reading or editing mirrored files.
4. Treat play mode as a sync suppression window; reconcile after play exits.
5. Resolve conflicts according to direction policy, not by silently overwriting both sides.
6. Confirm destructive local deletes before applying them to Studio unless delete auto-apply was explicitly enabled.
7. Verify by checking sync status, changed files, sourcemaps, and Roblox Explorer when relevant.

## References

- `references/sync-workflow.md`: status, directions, apply modes, and runtime lifecycle.
- `references/sync-format.md`: v2 nested directory and file naming rules.
- `references/conflicts.md`: direction enforcement and conflict resolution.
- `references/sourcemap.md`: Place sourcemaps and `luau-lsp` integration.
- `references/roblox-explorer.md`: VSCode Explorer view over the sync mirror.
- `references/roblox-docs.md`: Roblox documentation sources (llms.txt, engine API, related skills).

## Roblox Documentation

Before working with sync, Script Sync, or Roblox file formats, consult:
- **Creator Docs**: https://create.roblox.com/docs/llms.txt
  - `/docs/en-us/scripting/sync.md`: Script Sync guide
  - `/docs/en-us/projects/data-model.md`: Data model hierarchy
  - `/docs/en-us/projects/place-files.md`: Place file formats
- **Engine API**: https://create.roblox.com/docs/reference/engine/llms.txt

## Related Skills

- **roblox-core**: Data model, Instance methods, service catalog
- **roblox-testing**: Testing, debugging, profiling

## Guardrails

- Do not start sync while Studio is in play mode.
- Do not migrate or delete old sync roots automatically.
- Do not assume one active sync root per place; the project has one active `weppy-project-sync` root with isolated `place_*` children.
- Do not treat `__MCP_*` temporary test instances as synced game content.
