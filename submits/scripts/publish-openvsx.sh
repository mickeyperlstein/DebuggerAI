#!/usr/bin/env bash
# publish-openvsx.sh
#
# Publishes DebuggingAI to the Open VSX Registry (open-vsx.org).
# Open VSX is used by VSCodium, Gitpod, Theia, Eclipse Che, and all VS Code
# forks that cannot access Microsoft's proprietary marketplace.
#
# USAGE
#   Local:  OVSX_PAT=<token> ./submits/scripts/publish-openvsx.sh
#   CI:     Set OVSX_PAT as a GitHub Actions secret.
#
# ONE-TIME SETUP
#   1. https://open-vsx.org → Sign in with GitHub
#   2. Settings → Access Tokens → Generate New Token
#   3. Add token as GitHub secret OVSX_PAT
#
# DEPENDENCIES
#   node, npm  (Node 18+)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "${OVSX_PAT:-}" ]]; then
  echo "ERROR: OVSX_PAT environment variable is not set."
  echo "       Create a token at https://open-vsx.org and export OVSX_PAT=<token>"
  exit 1
fi

echo "==> Installing ovsx..."
npm install --no-save ovsx

# Build VSIX only if one doesn't already exist in the working directory
# (allows reuse when called after publish-vscode-marketplace.sh)
VSIX_FILE=$(ls -1 *.vsix 2>/dev/null | head -n1)
if [[ -z "${VSIX_FILE}" ]]; then
  echo "==> No .vsix found — packaging now..."
  npm install --no-save @vscode/vsce
  npm run compile
  npx @vscode/vsce package --no-dependencies
  VSIX_FILE=$(ls -1 *.vsix | head -n1)
fi
echo "==> Using VSIX: ${VSIX_FILE}"

echo "==> Publishing to Open VSX Registry..."
npx ovsx publish "${VSIX_FILE}" --pat "${OVSX_PAT}"

echo ""
echo "Done. Extension live at:"
echo "  https://open-vsx.org/extension/mickeyperlstein/debugging-ai"
