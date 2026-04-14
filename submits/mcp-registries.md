# MCP Server & VSIX Marketplace Publishing Guide

Complete reference for publishing DebuggingAI to every applicable registry and
marketplace. Scripts for each registry live in `submits/scripts/`.

---

## Quick Reference

| Marketplace | Type | Script | Secret(s) needed | Manual step? |
|---|---|---|---|---|
| VS Code Marketplace | VSIX | `publish-vscode-marketplace.sh` | `VSCE_PAT` | Create PAT once |
| Open VSX Registry | VSIX | `publish-openvsx.sh` | `OVSX_PAT` | Create token once |
| npm | MCP CLI | `publish-npm.sh` | `NPM_TOKEN` | Create token once |
| Smithery | MCP | `publish-smithery.sh` | `SMITHERY_API_KEY` | Login once |
| Official MCP Registry | MCP | `publish-official-mcp-registry.sh` | GitHub OIDC (CI) / login (local) | None in CI |
| Docker MCP Registry | MCP (Docker) | `submit-docker-mcp-registry.sh` | `GITHUB_TOKEN` | PR review by Docker |
| McpMux | MCP | `submit-mcpmux.sh` | `GITHUB_TOKEN` | PR review by McpMux |

Auto-indexed (no action required — they crawl npm/GitHub automatically):
**MCP.SO**, **PulseMCP**, **Glama**, **MCPMarket**, **MCP-Registry.net**

---

## 1. VS Code Marketplace

**URL:** https://marketplace.visualstudio.com/items?itemName=mickeyperlstein.debugging-ai  
**Script:** `submits/scripts/publish-vscode-marketplace.sh`  
**CI secret:** `VSCE_PAT`

### One-time setup
1. Go to https://dev.azure.com → sign in with your Microsoft account
2. Click your avatar → **Personal access tokens** → **New Token**
3. Name: `vsce-publish`, Organization: **All accessible organizations**
4. Scopes → **Custom defined** → tick **Marketplace → Manage**
5. Copy the token → add as GitHub secret `VSCE_PAT`

### What the script does
- Runs `npm run compile`
- Packages the VSIX with `@vscode/vsce`
- Publishes directly to the VS Code Marketplace

### Notes
- Publisher name must match `"publisher": "mickeyperlstein"` in `package.json`
- The publisher page must exist at https://marketplace.visualstudio.com/manage before first publish

---

## 2. Open VSX Registry

**URL:** https://open-vsx.org/extension/mickeyperlstein/debugging-ai  
**Script:** `submits/scripts/publish-openvsx.sh`  
**CI secret:** `OVSX_PAT`

### One-time setup
1. Go to https://open-vsx.org → sign in with GitHub
2. **Settings** → **Access Tokens** → **Generate New Token**
3. Name it `debugging-ai-publish`, copy the token
4. Add as GitHub secret `OVSX_PAT`

### What the script does
- Packages VSIX (or reuses existing `*.vsix` in the working directory)
- Publishes via `ovsx publish`

### Notes
- Open VSX is the marketplace used by VSCodium, Gitpod, Theia, Eclipse Che, and
  any VS Code fork that can't use Microsoft's marketplace
- No separate publisher registration needed — namespace is created on first publish

---

## 3. npm (MCP server CLI)

**URL:** https://www.npmjs.com/package/debugging-ai  
**Script:** `submits/scripts/publish-npm.sh`  
**CI secret:** `NPM_TOKEN`

### One-time setup
1. Go to https://www.npmjs.com → create account or log in
2. **Access Tokens** → **Generate New Token** → **Automation** (for CI)
3. Add as GitHub secret `NPM_TOKEN`
4. Run `npm login` locally for manual publishes

### What the script does
- Compiles the project
- Publishes the `debugging-ai` package (includes `out/`, icon, README, LICENSE)
- The `bin` entry `debugging-ai-mcp` lets users run the MCP server via:
  `npx -y --package=debugging-ai debugging-ai-mcp`

### Notes
- Required by Smithery and the Official MCP Registry (both reference the npm package)
- The `files` field in `package.json` controls what's included in the npm tarball
- First publish must use `--access public` since the package name is unscoped

---

## 4. Smithery

**URL:** https://smithery.ai/server/mickeyperlstein/debuggingai  
**Script:** `submits/scripts/publish-smithery.sh`  
**CI secret:** `SMITHERY_API_KEY`

### One-time setup
1. Go to https://smithery.ai → sign in with GitHub
2. **Settings** → **API Keys** → create a key
3. Add as GitHub secret `SMITHERY_API_KEY`
4. The `smithery.yaml` file is already present in the repo root

### What the script does
- Installs the `@smithery/cli` package
- Publishes/updates the server entry on Smithery pointing to this GitHub repo
- Smithery reads `smithery.yaml` to build and deploy the MCP server

### Config file: `smithery.yaml` (already in repo root)
```yaml
name: debuggingai
startCommand:
  type: stdio
  configSchema:          # port + host options
  commandFunction: ...   # npx --package=debugging-ai debugging-ai-mcp
```

### Notes
- Smithery hosts the server and provides a managed endpoint — users don't need to
  run the MCP server locally; Smithery runs it for them
- The `commandFunction` uses `npx` so npm must be published first
- Smithery also auto-generates Claude Desktop / Cursor config snippets for users

---

## 5. Official MCP Registry

> **Note on `modelcontextprotocol/servers` (GitHub):** That repo has 83k stars and
> looks like the place to submit — but it **no longer accepts new server implementations**.
> The README list is explicitly deprecated and will be removed. All new submissions
> are redirected here instead.

**URL:** https://registry.modelcontextprotocol.io  
**Script:** `submits/scripts/publish-official-mcp-registry.sh`  
**CI:** Uses GitHub OIDC (no secret needed in CI — the token is minted automatically)  
**Local:** Run `mcp-publisher login github` once

### One-time setup (local only)
```bash
npm install -g @modelcontextprotocol/mcp-publisher
mcp-publisher login github   # opens browser GitHub device-flow
```
In CI, GitHub OIDC is used automatically — no secret required.

### Required: `mcpName` in `package.json`
The registry requires this field (already present):
```json
"mcpName": "io.github.mickeyperlstein/debuggingai"
```
The format **must** be `io.github.<owner>/<repo>`.

### Generating `server.json`
The script runs `mcp-publisher init` to generate the manifest, then patches in
the correct values from `package.json` automatically. You can also run it
manually and edit by hand.

### What the script does
- Writes `server.json` with the server metadata (name, description, packages)
- In CI: authenticates via `mcp-publisher login github-oidc`
- Publishes with `mcp-publisher publish`

### `server.json` format (generated by the script)
```json
{
  "$schema": "https://registry.modelcontextprotocol.io/schema/v0/server.json",
  "name": "io.github.mickeyperlstein/debuggingai",
  "description": "Universal debugger control for any AI agent",
  "license": "MIT",
  "packages": [{
    "registry_name": "npm",
    "name": "debugging-ai",
    "command": "debugging-ai-mcp",
    "environment_variables": [
      { "name": "DEBUGAI_PORT", "default": "7890" },
      { "name": "DEBUGAI_HOST", "default": "127.0.0.1" }
    ]
  }]
}
```

### Notes
- The `name` field **must** follow `io.github.<owner>/<repo>` format
- This registry feeds GitHub Copilot's server discovery
- Server version is inferred from the npm package version — no manual versioning

---

## 6. Docker MCP Registry

**URL:** https://github.com/docker/mcp-registry  
**Script:** `submits/scripts/submit-docker-mcp-registry.sh`  
**CI secret:** `GITHUB_TOKEN` (built-in)  
**Requires:** PR approval by Docker team (1–2 business days)

### One-time setup
- No secrets beyond the built-in `GITHUB_TOKEN`
- Docker reviews and merges the PR; they then build, sign, and push the image

### What the script does
1. Forks `docker/mcp-registry` (or uses existing fork)
2. Creates a server definition JSON file in `servers/debugging-ai.json`
3. Commits and opens a PR to `docker/mcp-registry`

### Server definition format
```json
{
  "id": "debugging-ai",
  "name": "DebuggingAI",
  "description": "...",
  "vendor": "mickeyperlstein",
  "sourceUrl": "https://github.com/mickeyperlstein/DebuggingAI",
  "dockerImage": "pitronot/debuggingai",
  "categories": ["development", "debugging"]
}
```

### Notes
- The Docker image `pitronot/debuggingai` is already published by the existing
  release workflow — this PR just registers it in Docker's catalogue
- After merge, Docker wraps the image with cryptographic signatures, SBOMs, and
  provenance metadata
- Users can then run: `docker mcp run debugging-ai`

---

## 7. McpMux

**URL:** https://mcpmux.com  
**Script:** `submits/scripts/submit-mcpmux.sh`  
**CI secret:** `GITHUB_TOKEN` (built-in)  
**Requires:** PR approval by McpMux maintainers

### One-time setup
- No special secrets needed

### What the script does
1. Forks `mcpmux/registry` (or uses existing fork)
2. Writes a server definition file `servers/debugging-ai.json`
3. Opens a PR with the definition

### Server definition format (McpMux schema)
```json
{
  "id": "debugging-ai",
  "name": "DebuggingAI",
  "description": "...",
  "homepage": "https://github.com/mickeyperlstein/DebuggingAI",
  "license": "MIT",
  "categories": ["development", "debugging"],
  "installations": {
    "npm": {
      "command": "npx",
      "args": ["-y", "--package=debugging-ai", "debugging-ai-mcp"],
      "env": {
        "DEBUGAI_PORT": { "description": "Extension server port", "default": "7890" },
        "DEBUGAI_HOST": { "description": "Extension server host", "default": "127.0.0.1" }
      }
    }
  }
}
```

### Notes
- McpMux validates the definition file against their JSON Schema before accepting the PR
- Once merged, the server appears with one-click install buttons for Cursor, Claude,
  VS Code, Windsurf, JetBrains, Gemini CLI

---

## 8. Auto-indexed registries (no action required)

These platforms crawl GitHub and npm automatically. Once the npm package is
published and the GitHub repo is public, they will index DebuggingAI within
hours to days.

| Registry | Notes |
|---|---|
| **MCP.SO** (mcp.so) | 20k+ servers; ranks by call volume |
| **PulseMCP** (pulsemcp.com) | 12.5k+ servers; daily updates + weekly newsletter |
| **Glama** (glama.ai/mcp/servers) | Security grades A–F; scans for vulnerabilities |
| **MCPMarket** (mcpmarket.com) | Semantic search index |
| **MCP-Registry.net** (mcp-registry.net) | Community registry; 1000+ servers |
| **Awesome MCP Servers** (mcpservers.org) | Curated list; can submit via web form |

To accelerate indexing on any of these, post the GitHub URL in their community
Discord or submit via their web form if available.

---

## Recommended publish order

Run in this order to satisfy dependencies (npm must precede Smithery and the
Official MCP Registry since both reference the npm package):

```
1. publish-npm.sh
2. publish-vscode-marketplace.sh
3. publish-openvsx.sh
4. publish-smithery.sh
5. publish-official-mcp-registry.sh
6. submit-docker-mcp-registry.sh   (opens PR — async)
7. submit-mcpmux.sh                (opens PR — async)
```

Or run `publish-all.sh` which executes them in this order automatically.
