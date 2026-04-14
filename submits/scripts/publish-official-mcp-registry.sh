#!/usr/bin/env bash
# publish-official-mcp-registry.sh
#
# Publishes DebuggingAI to the Official MCP Registry
# (registry.modelcontextprotocol.io).
#
# This registry is maintained by the MCP working group (Anthropic, GitHub,
# PulseMCP, Microsoft) and feeds GitHub Copilot's server discovery.
#
# USAGE
#   Local:  ./submits/scripts/publish-official-mcp-registry.sh
#           (will open browser for GitHub OAuth on first run)
#   CI:     No secret needed — uses GitHub OIDC token automatically.
#           Add this to your workflow job permissions:
#             permissions:
#               id-token: write
#               contents: read
#
# PREREQUISITES
#   npm package must be published first (the registry references it).
#   Run publish-npm.sh before this script.
#
# DEPENDENCIES
#   node, npm  (Node 18+)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

VERSION=$(node -p "require('./package.json').version")

# ── Generate server.json ──────────────────────────────────────────────────────
echo "==> Writing server.json..."
cat > server.json <<EOF
{
  "\$schema": "https://registry.modelcontextprotocol.io/schema/v0/server.json",
  "name": "io.github.mickeyperlstein/debuggingai",
  "description": "Universal debugger control for any AI agent — Claude, Cline, Cursor, and more. Exposes VS Code's full debugger (breakpoints, stepping, variable inspection) as MCP tools.",
  "license": "MIT",
  "repository": {
    "url": "https://github.com/mickeyperlstein/DebuggingAI",
    "source": "github"
  },
  "packages": [
    {
      "registry_name": "npm",
      "name": "debugging-ai",
      "version": "${VERSION}",
      "command": "debugging-ai-mcp",
      "environment_variables": [
        {
          "name": "DEBUGAI_PORT",
          "description": "Port where the DebuggingAI VS Code extension HTTP server is listening",
          "default": "7890"
        },
        {
          "name": "DEBUGAI_HOST",
          "description": "Host where the DebuggingAI VS Code extension HTTP server is listening",
          "default": "127.0.0.1"
        }
      ]
    }
  ]
}
EOF
echo "    Written server.json for version ${VERSION}"

# ── Install mcp-publisher ─────────────────────────────────────────────────────
echo "==> Installing @modelcontextprotocol/mcp-publisher..."
npm install --no-save @modelcontextprotocol/mcp-publisher

# ── Authenticate ──────────────────────────────────────────────────────────────
if [[ "${CI:-}" == "true" || -n "${GITHUB_ACTIONS:-}" ]]; then
  echo "==> CI detected — authenticating via GitHub OIDC..."
  # Requires permissions: id-token: write in the workflow job
  npx mcp-publisher login github-oidc
else
  echo "==> Local run — authenticating via GitHub OAuth (browser will open)..."
  npx mcp-publisher login
fi

# ── Publish ───────────────────────────────────────────────────────────────────
echo "==> Publishing to Official MCP Registry..."
npx mcp-publisher publish

echo ""
echo "Done. Server live at:"
echo "  https://registry.modelcontextprotocol.io/servers/io.github.mickeyperlstein/debuggingai"
