# Creator Store Reference

1. Use `manage_assets.search` to find candidates, then review their metadata before inserting one.
2. Use `manage_assets.info` when the user provides an asset ID.
3. Use `manage_assets.insert` only for an explicit asset ID or a search result the user accepted.
4. Use `manage_assets.search_insert` only when the user explicitly accepts automatic first-match insertion.
5. Use `manage_assets.insert_free` for a verified free model and `manage_assets.insert_package` for a verified package.
6. Verify the asset ID, Creator, asset type, target parent, and inserted Studio path.

Never invent an asset ID or treat a search result as user approval.
