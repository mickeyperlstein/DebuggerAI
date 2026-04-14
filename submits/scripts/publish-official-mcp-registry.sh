#!/usr/bin/env bash
# publish-official-mcp-registry.sh
#
# Publishes DebuggingAI to the Official MCP Registry
# (registry.modelcontextprotocol.io).
#
# This registry is maintained by the MCP working group (Anthropic, GitHub,
# PulseMCP, Microsoft) and feeds GitHub Copilot's server discovery.
#
# NOTE: modelcontextprotocol/servers on GitHub no longer accepts new server
# submissions — the README list is deprecated. This registry is the correct
# destination.
#
# USAGE
#   Local:  ./submits/scripts/publish-official-mcp-registry.sh
#           (opens browser for GitHub device-flow auth on first run)
#   CI:     No secret needed — uses GitHub OIDC token automatically.
#           Add to your workflow job permissions:
#             permissions:
#               id-token: write
#               contents: read
#
# PREREQUISITES
#   npm package must be published first — the registry references it.
#   Run publish-npm.sh before this script.
#
# DEPENDENCIES
#   node, npm  (Node 18+), curl
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

VERSION=$(node -p "require('./package.json').version")
MCP_NAME=$(node -p "require('./package.json').mcpName")

echo "==> Installing @modelcontextprotocol/mcp-publisher..."
npm install --no-save @modelcontextprotocol/mcp-publisher

# ── Generate server.json via mcp-publisher init ───────────────────────────────
# Only regenerate if server.json is missing or --force is passed.
if [[ ! -f "server.json" || "${1:-}" == "--force" ]]; then
  echo "==> Generating server.json with mcp-publisher init..."
  npx mcp-publisher init

  # mcp-publisher init writes a template; patch in our known values.
  # Use node to do safe JSON manipulation instead of fragile sed.
  node - <<'JS'
const fs = require('fs');
const pkg = require('./package.json');
const s   = JSON.parse(fs.readFileSync('server.json', 'utf8'));

s.name        = pkg.mcpName;
s.description = pkg.description;
s.license     = pkg.license;
s.repository  = { url: pkg.repository.url, source: 'github' };

// Ensure the npm package entry is correct
const npmPkg = s.packages?.find(p => p.registry_name === 'npm') ?? {};
npmPkg.registry_name = 'npm';
npmPkg.name          = pkg.name;
npmPkg.version       = pkg.version;
npmPkg.command       = 'debugging-ai-mcp';
npmPkg.environment_variables = [
  { name: 'DEBUGAI_PORT', description: 'Port where the DebuggingAI VS Code extension HTTP server is listening', default: '7890' },
  { name: 'DEBUGAI_HOST', description: 'Host where the DebuggingAI VS Code extension HTTP server is listening', default: '127.0.0.1' },
];
s.packages = [npmPkg];

fs.writeFileSync('server.json', JSON.stringify(s, null, 2) + '\n');
console.log('server.json patched successfully.');
JS
else
  echo "==> server.json already exists (pass --force to regenerate)"
fi

echo "==> server.json contents:"
cat server.json

# ── Authenticate ──────────────────────────────────────────────────────────────
if [[ "${CI:-}" == "true" || -n "${GITHUB_ACTIONS:-}" ]]; then
  echo "==> CI detected — authenticating via GitHub OIDC..."
  # Requires job permission: id-token: write
  npx mcp-publisher login github-oidc
else
  echo "==> Local run — authenticating via GitHub device flow (browser will open)..."
  npx mcp-publisher login github
fi

# ── Publish ───────────────────────────────────────────────────────────────────
echo "==> Publishing ${MCP_NAME}@${VERSION} to Official MCP Registry..."
npx mcp-publisher publish

echo ""
echo "Done. Server live at:"
echo "  https://registry.modelcontextprotocol.io/servers/${MCP_NAME}"
