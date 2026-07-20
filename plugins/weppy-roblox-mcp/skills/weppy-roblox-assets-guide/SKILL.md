---
name: weppy-roblox-assets-guide
description: Use when creating, importing, reviewing, uploading, updating, or reusing Roblox assets through WEPPY Asset Library, Studio-local asset workflows, AI-generated images or models, and Roblox Open Cloud.
---

# WEPPY Roblox Assets Guide

## Workflow

1. Identify whether the source is a Studio selection or path, an Asset Library item, a generated local file, a Creator Store result, or an existing Roblox asset.
2. Read `references/asset-library.md` for local round-trip, import, review, and thumbnail work.
3. Read `references/creator-store.md` before searching, inspecting, or inserting a Creator Store asset.
4. Read `references/generated-assets.md` when an AI image file or Roblox GenerationService model is involved.
5. Read `references/studio-upload.md` before any Studio-local upload or temporary embedded-resource upload.
6. Read `references/open-cloud-upload.md` before credential checks, Open Cloud upload or update, and operation polling.
7. Ask for explicit approval whenever the workflow can create billable or temporary Roblox assets.
8. Verify the returned local asset ID, Roblox asset ID or URI, operation status, and intended Creator before using the result.

Read `../weppy-roblox-mcp-guide/references/mcp-actions.md` for exact action schemas and parameters.

## Roblox Documentation

Before uploading assets or using Roblox asset APIs, consult:
- **Engine API**: https://create.roblox.com/docs/reference/engine/llms.txt
- **Creator Docs**: https://create.roblox.com/docs/llms.txt
- **Open Cloud**: https://create.roblox.com/docs/cloud/llms.txt

## Related Skills

- **roblox-core**: Instance management, service catalog
- **roblox-mcp**: Official Roblox Studio MCP server tools

## Guardrails

- Never invent Roblox asset IDs or Creator IDs.
- Never print or request a raw Open Cloud API key through MCP tool arguments.
- Never set `uploadTemporaryAssets=true` without explicit user approval.
- Do not imply that WEPPY deletes, archives, or restores remote Roblox assets.
- Keep Studio-local upload and Open Cloud upload as separate workflows.
