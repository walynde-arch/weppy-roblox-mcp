# Open Cloud Upload Reference

1. Call `manage_open_cloud_assets.preflight` to check the upload toggle, credential authentication, Assets Read/Write, Creator target, and optional file readiness without uploading.
2. Call `manage_open_cloud_assets.credential_status` only when credential profile metadata is also needed, without exposing the raw API key.
3. Call `manage_open_cloud_assets.capabilities` and confirm the file extension and category pair.
4. Confirm Creator type and ID, ownership intent, and expected upload fee when required.
5. Use `manage_open_cloud_assets.upload` for a new remote asset or `manage_open_cloud_assets.update` only when the user explicitly asks to change an existing asset ID.
6. Use `manage_open_cloud_assets.operation_status` until processing completes when the first response is pending.
7. Verify the returned asset ID, operation ID, status, Creator, and local source path.

NovaMCP does not expose remote Roblox asset deletion, archive, or restore actions. Never pass a raw API key in tool parameters, logs, or skill output.
