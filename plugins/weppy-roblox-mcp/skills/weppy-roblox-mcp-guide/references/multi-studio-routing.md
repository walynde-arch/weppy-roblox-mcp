# Multi-Studio Routing Reference

Choose one connected Studio before any mutation, playtest, screenshot, batch, or verification sequence.

Selector precedence is `clientId > targetAlias > placeId`.

- Use `clientId` when the exact plugin client is known.
- Use `targetAlias` when the user or Dashboard identifies a read-only Studio ID such as `studio-1`.
- Use `placeId` only when one active client for that Place is sufficient. If more than one active client matches, select a more specific selector.
- If an explicit selector has no active match or lower-priority selectors disagree with the selected client, report the routing failure. Do not silently fall back to another Studio.
- Keep the same selector on readback and verification calls, including every subcommand used by `manage_studio.run_test`.
- `batch_execute` accepts selectors only at the top level; nested command selectors are invalid.
- For `manage_assets` Asset Library round-trip actions, `placeId` identifies the storage scope rather than the Studio route. Use `clientId` to choose the exact Studio for those calls.

When the user did not choose among multiple plausible targets, ask which Studio to use before mutating it.
