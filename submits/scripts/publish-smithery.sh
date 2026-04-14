#!/usr/bin/env bash
# publish-smithery.sh
#
# Registers / updates DebuggingAI on Smithery (smithery.ai).
# Smithery is an MCP server marketplace that hosts and runs MCP servers for
# users — they get a managed endpoint without needing to run anything locally.
#
# Requires the smithery.yaml file to exist in the repo root (already present).
#
# USAGE
#   Local:  SMITHERY_API_KEY=<key> ./submits/scripts/publish-smithery.sh
#   CI:     Set SMITHERY_API_KEY as a GitHub Actions secret.
#
# ONE-TIME SETUP
#   1. https://smithery.ai → Sign in with GitHub
#   2. Settings → API Keys → Create key
#   3. Add as GitHub secret SMITHERY_API_KEY
#
# PREREQUISITES
#   npm must be published first (smithery.yaml references the npm package).
#   Run publish-npm.sh before this script.
#
# DEPENDENCIES
#   node, npm  (Node 18+)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "${SMITHERY_API_KEY:-}" ]]; then
  echo "ERROR: SMITHERY_API_KEY environment variable is not set."
  echo "       Get an API key at https://smithery.ai → Settings → API Keys"
  exit 1
fi

if [[ ! -f "smithery.yaml" ]]; then
  echo "ERROR: smithery.yaml not found in repo root."
  exit 1
fi

echo "==> Installing @smithery/cli..."
npm install --no-save @smithery/cli

# Read the server name from smithery.yaml (field: name)
SERVER_NAME=$(grep -E '^name:' smithery.yaml | awk '{print $2}' | tr -d '"')
ORG="mickeyperlstein"
REPO_URL="https://github.com/mickeyperlstein/DebuggingAI"

echo "==> Publishing '${ORG}/${SERVER_NAME}' to Smithery..."
npx @smithery/cli mcp publish "${REPO_URL}" \
  --name "${ORG}/${SERVER_NAME}" \
  --api-key "${SMITHERY_API_KEY}"

echo ""
echo "Done. Server live at:"
echo "  https://smithery.ai/server/${ORG}/${SERVER_NAME}"
echo ""
echo "Users can install with:"
echo "  npx @smithery/cli install ${ORG}/${SERVER_NAME} --client claude"
