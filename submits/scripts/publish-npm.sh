#!/usr/bin/env bash
# publish-npm.sh
#
# Publishes the 'debugging-ai' package to npm.
# This makes the MCP server CLI available via:
#   npx -y --package=debugging-ai debugging-ai-mcp
#
# This step is a prerequisite for Smithery and the Official MCP Registry,
# both of which reference the npm package in their configurations.
#
# USAGE
#   Local:  npm login first, then ./submits/scripts/publish-npm.sh
#   CI:     Set NPM_TOKEN as a GitHub Actions secret.
#           setup-node must have registry-url: 'https://registry.npmjs.org'
#
# ONE-TIME SETUP
#   1. https://www.npmjs.com → account → Access Tokens → Generate New Token
#   2. Token type: Automation  (bypasses 2FA in CI)
#   3. Add token as GitHub secret NPM_TOKEN
#
# DEPENDENCIES
#   node, npm  (Node 18+)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

# ── Validation ────────────────────────────────────────────────────────────────
# In CI, NODE_AUTH_TOKEN is set by setup-node; locally, npm login is used.
if [[ -z "${NODE_AUTH_TOKEN:-}" && -z "${NPM_TOKEN:-}" ]]; then
  # Check if already logged in locally
  if ! npm whoami &>/dev/null; then
    echo "ERROR: Not authenticated with npm."
    echo "       Run 'npm login' locally, or set NPM_TOKEN / NODE_AUTH_TOKEN in CI."
    exit 1
  fi
  echo "==> Using existing npm session ($(npm whoami))"
else
  # CI path: export NODE_AUTH_TOKEN which npm reads from the .npmrc written by setup-node
  export NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-${NPM_TOKEN}}"
  echo "==> Using NPM_TOKEN / NODE_AUTH_TOKEN for authentication"
fi

echo "==> Compiling..."
npm run compile

VERSION=$(node -p "require('./package.json').version")
echo "==> Publishing debugging-ai@${VERSION} to npm..."

# --access public is required for first publish of an unscoped package.
# Subsequent publishes don't require it but it's harmless.
npm publish --access public

echo ""
echo "Done. Package live at:"
echo "  https://www.npmjs.com/package/debugging-ai"
echo ""
echo "Users can now run the MCP server with:"
echo "  npx -y --package=debugging-ai debugging-ai-mcp"
