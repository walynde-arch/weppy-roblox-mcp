# Asset Library Reference

Use Asset Library for local, inspectable asset round-trips.

1. Choose `scope="place"` unless the user explicitly needs a shared asset.
2. Export a selection or Studio path with `manage_assets.export_selection_rbxm` or `manage_assets.export_path_rbxm`.
3. Use `manage_assets.review_model` before registration when model structure or bounds matter.
4. Use `manage_assets.generate_thumbnail` for an existing Asset Library RBXM item.
5. Use `manage_assets.import_rbxm` to place the reviewed item back into Studio.
6. Verify `assetLibraryAssetId`, scope, Place ID, source path, and imported Studio path.

Local Asset Library deletion removes only the Asset Library-owned local item. It never means remote Roblox asset deletion.
