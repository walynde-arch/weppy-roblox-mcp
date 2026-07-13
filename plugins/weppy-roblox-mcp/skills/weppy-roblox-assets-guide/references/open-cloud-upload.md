# Open Cloud Upload Reference

1. Call `manage_open_cloud_assets.credential_status` without exposing the raw API key.
2. Call `manage_open_cloud_assets.capabilities` and confirm the file extension and category pair.
3. Confirm Creator type and ID, ownership intent, and expected upload fee when required.
4. Use `manage_open_cloud_assets.upload` for a new remote asset or `manage_open_cloud_assets.update` only when the user explicitly asks to change an existing asset ID.
5. Use `manage_open_cloud_assets.operation_status` until processing completes when the first response is pending.
6. Verify the returned asset ID, operation ID, status, Creator, and local source path.

WEPPY does not expose remote Roblox asset deletion, archive, or restore actions. Never pass a raw API key in tool parameters, logs, or skill output.
