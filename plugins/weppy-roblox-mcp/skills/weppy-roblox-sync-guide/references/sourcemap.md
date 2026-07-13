# WEPPY Sourcemap Reference

WEPPY writes a Rojo-style sourcemap for `luau-lsp`.

- Canonical per-Place file: `weppy-project-sync/place_<id>/sourcemap.json`
- Active-Place representative: `weppy-project-sync/sourcemap.json`
- `filePaths` are relative to `weppy-project-sync` and currently point to script files.
- A full sync refreshes the Place sourcemap; changing the active Place refreshes the representative root file.

Use the Place file when a tool or editor must remain pinned to one Place. Use the root file only when following the current active Place is intended. Sourcemap output supports language tooling; Roblox Explorer still reads `_tree.json` and adjacent mirror files for its tree.
