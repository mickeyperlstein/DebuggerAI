#!/usr/bin/env bash
# publish-vscode-marketplace.sh
#
# Publishes DebuggingAI to the VS Code Marketplace.
#
# USAGE
#   Local:  VSCE_PAT=<token> ./submits/scripts/publish-vscode-marketplace.sh
#   CI:     Set VSCE_PAT as a GitHub Actions secret; the release workflow calls this.
#
# ONE-TIME SETUP
#   1. https://dev.azure.com → avatar → Personal access tokens → New Token
#   2. Name: vsce-publish | Org: All accessible organizations
#   3. Scopes: Custom → Marketplace → Manage
#   4. Add token as GitHub secret VSCE_PAT
#
# DEPENDENCIES
#   node, npm  (Node 18+)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "${VSCE_PAT:-}" ]]; then
  echo "ERROR: VSCE_PAT environment variable is not set."
  echo "       Create a token at https://dev.azure.com and export VSCE_PAT=<token>"
  exit 1
fi

echo "==> Installing @vscode/vsce..."
npm install --no-save @vscode/vsce

echo "==> Compiling..."
npm run compile

echo "==> Packaging VSIX..."
npx @vscode/vsce package --no-dependencies

VSIX_FILE=$(ls -1 *.vsix 2>/dev/null | head -n1)
if [[ -z "${VSIX_FILE}" ]]; then
  echo "ERROR: No .vsix file found after packaging."
  exit 1
fi
echo "    Packaged: ${VSIX_FILE}"

echo "==> Publishing to VS Code Marketplace..."
npx @vscode/vsce publish --no-dependencies --packagePath "${VSIX_FILE}"

echo ""
echo "Done. Extension live at:"
echo "  https://marketplace.visualstudio.com/items?itemName=mickeyperlstein.debugging-ai"
