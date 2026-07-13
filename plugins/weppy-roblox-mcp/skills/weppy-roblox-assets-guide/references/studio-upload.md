# Studio-local Upload Reference

`manage_assets.upload_asset` uploads a selected or path-based Studio object through Studio-local AssetService. It does not use the Open Cloud credential profile.

For RBXM export and review actions, keep `uploadMode="localOnly"` and `uploadTemporaryAssets=false` unless the user explicitly approves a Roblox upload. Set `uploadTemporaryAssets=true` only after explicit user approval, and state whether the approved path is a whole Model upload or an embedded Mesh or Image fallback.

After upload, verify `assetType`, Creator, Roblox asset ID or URI, `studioUploads[]`, and local Asset Library registration separately. If Studio opens its own upload dialog as a fallback, do not assume that WEPPY received a new asset ID.
