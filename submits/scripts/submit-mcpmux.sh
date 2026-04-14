#!/usr/bin/env bash
# submit-mcpmux.sh
#
# Submits DebuggingAI to McpMux (mcpmux.com) by opening a PR against
# their registry GitHub repository.
#
# After the PR is merged, the server appears on mcpmux.com with one-click
# install buttons for Cursor, Claude, VS Code, Windsurf, JetBrains, Gemini CLI.
#
# USAGE
#   Local:  GITHUB_TOKEN=<pat> ./submits/scripts/submit-mcpmux.sh
#   CI:     Uses the built-in GITHUB_TOKEN secret (no extra setup needed).
#
# DEPENDENCIES
#   git, curl, jq
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
VERSION=$(node -p "require('${REPO_ROOT}/package.json').version")

UPSTREAM_ORG="mcpmux"
UPSTREAM_REPO="registry"
FORK_ORG="mickeyperlstein"
SERVER_ID="debugging-ai"
BRANCH="add-${SERVER_ID}"

API="https://api.github.com"
AUTH_HEADER="Authorization: Bearer ${GITHUB_TOKEN}"

echo "==> Checking for existing fork of ${UPSTREAM_ORG}/${UPSTREAM_REPO}..."
FORK_EXISTS=$(curl -sf -H "${AUTH_HEADER}" \
  "${API}/repos/${FORK_ORG}/${UPSTREAM_REPO}" \
  | jq -r '.full_name // empty' || true)

if [[ -z "${FORK_EXISTS}" ]]; then
  echo "==> Forking ${UPSTREAM_ORG}/${UPSTREAM_REPO}..."
  curl -sf -X POST -H "${AUTH_HEADER}" \
    "${API}/repos/${UPSTREAM_ORG}/${UPSTREAM_REPO}/forks" \
    -d "{\"organization\":\"${FORK_ORG}\"}" > /dev/null
  echo "    Fork created. Waiting 10 s for GitHub to provision it..."
  sleep 10
else
  echo "    Fork already exists: ${FORK_EXISTS}"
fi

# ── Clone the fork locally ────────────────────────────────────────────────────
WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "==> Cloning fork..."
git clone --depth 1 \
  "https://x-access-token:${GITHUB_TOKEN}@github.com/${FORK_ORG}/${UPSTREAM_REPO}.git" \
  "${WORK_DIR}"
cd "${WORK_DIR}"

git remote add upstream "https://github.com/${UPSTREAM_ORG}/${UPSTREAM_REPO}.git"
git fetch upstream main --depth 1
git merge --ff-only upstream/main || git reset --hard upstream/main

# ── Write the server definition (McpMux JSON schema) ─────────────────────────
echo "==> Writing McpMux server definition..."
mkdir -p servers
cat > "servers/${SERVER_ID}.json" <<EOF
{
  "id": "${SERVER_ID}",
  "name": "DebuggingAI",
  "description": "Universal debugger control for any AI agent — Claude, Cline, Cursor, and more. Exposes VS Code's full debugger (breakpoints, step over/into/out, variable inspection, watch expressions) as MCP tools. Works with Node.js, Python, and Dart.",
  "homepage": "https://github.com/mickeyperlstein/DebuggingAI",
  "license": "MIT",
  "version": "${VERSION}",
  "categories": ["development", "debugging", "ai-tools"],
  "installations": {
    "npm": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "--package=debugging-ai", "debugging-ai-mcp"],
      "env": {
        "DEBUGAI_PORT": {
          "description": "Port where the DebuggingAI VS Code extension HTTP server is listening",
          "default": "7890",
          "required": false
        },
        "DEBUGAI_HOST": {
          "description": "Host where the DebuggingAI VS Code extension HTTP server is listening",
          "default": "127.0.0.1",
          "required": false
        }
      }
    }
  }
}
EOF

# ── Commit and push ───────────────────────────────────────────────────────────
git config user.email "actions@github.com"
git config user.name "GitHub Actions"

git checkout -b "${BRANCH}"
git add "servers/${SERVER_ID}.json"
git commit -m "Add DebuggingAI MCP server"
git push origin "${BRANCH}" --force

# ── Open PR ───────────────────────────────────────────────────────────────────
echo "==> Opening pull request..."
PR_URL=$(curl -sf -X POST -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  "${API}/repos/${UPSTREAM_ORG}/${UPSTREAM_REPO}/pulls" \
  -d "{
    \"title\": \"Add DebuggingAI MCP server\",
    \"body\": \"Adds DebuggingAI v${VERSION} to the McpMux registry.\\n\\n**What it does:** Exposes VS Code's full debugger as MCP tools — breakpoints, step over/into/out, variable inspection, watch expressions — for Node.js, Python, and Dart.\\n\\n**Install command:**\\n\`\`\`\\nnpx -y --package=debugging-ai debugging-ai-mcp\\n\`\`\`\\n\\n**Source:** https://github.com/mickeyperlstein/DebuggingAI\\n**npm:** https://www.npmjs.com/package/debugging-ai\",
    \"head\": \"${FORK_ORG}:${BRANCH}\",
    \"base\": \"main\"
  }" | jq -r '.html_url')

echo ""
echo "Done. Pull request opened:"
echo "  ${PR_URL}"
echo ""
echo "After merge, server will appear at: https://mcpmux.com/servers/${SERVER_ID}"
echo "Users will get one-click install for Cursor, Claude, VS Code, Windsurf, JetBrains, Gemini CLI."
