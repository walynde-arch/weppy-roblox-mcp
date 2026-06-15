# Playtest Reference

Use playtest actions when verifying runtime behavior, collecting logs, or creating dashboard-linked test reports.

## Control Flow

- `manage_studio.play_status`: check whether Studio is in edit, running, or paused state.
- `manage_studio.play_start`: start a playtest. `mode="play"` maps to F5 and `mode="run"` maps to F8.
- `manage_studio.play_pause`: pause a running playtest.
- `manage_studio.play_resume`: resume a paused playtest.
- `manage_studio.play_stop`: stop a playtest.
- `manage_studio.run_test`: inject a Luau test body, run playtest, collect logs, and write report files.

Read `mcp-actions.md` for exact params and tiers.

## Automated Test Runner

`manage_studio.run_test` requires `script`. Optional fields include `mode`, `test_name`, `timeout`, `contextId`, `contextSummary`, and `replayMetadata`.

The runner wraps the user script, emits `[WEPPY_TEST]` log signals, collects `manage_logs` output, stops playtest during cleanup, and stores report artifacts under the active place test directory.

## Screenshot Limitation

`manage_camera.screenshot` is Edit-mode only. If unsure, call `manage_studio.play_status` first and proceed only when the state is edit. Play-mode screenshot capture is not supported in this build.

## Sync Interaction

Play mode suppresses sync updates. Do not start full sync during play mode. After play exits, sync performs post-play reconciliation before normal incremental sync resumes.
