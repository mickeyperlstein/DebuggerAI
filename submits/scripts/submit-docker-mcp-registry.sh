#!/usr/bin/env bash
# submit-docker-mcp-registry.sh
#
# Submits DebuggingAI to the Docker MCP Registry by opening a PR against
# https://github.com/docker/mcp-registry
#
# After the PR is merged, Docker automatically:
#   - Builds and signs the image
#   - Adds provenance tracking and SBOM
#   - Makes it available via: docker mcp run debugging-ai
#
# USAGE
#   Local:  GITHUB_TOKEN=<pat> ./submits/scripts/submit-docker-mcp-registry.sh
#   CI:     Uses the built-in GITHUB_TOKEN secret (no extra setup needed).
#
# ONE-TIME SETUP
#   - The Docker image pitronot/debuggingai must already be published to Docker Hub
#     (the existing release.yml workflow handles this on every tag push).
#   - GITHUB_TOKEN needs: repo scope (for fork + PR creation)
#     In CI the built-in token is sufficient.
#
# DEPENDENCIES
#   git, curl, jq
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
VERSION=$(node -p "require('${REPO_ROOT}/package.json').version")

UPSTREAM_ORG="docker"
UPSTREAM_REPO="mcp-registry"
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

# Sync with upstream main before branching
git remote add upstream "https://github.com/${UPSTREAM_ORG}/${UPSTREAM_REPO}.git"
git fetch upstream main --depth 1
git merge --ff-only upstream/main || git reset --hard upstream/main

# ── Create the server definition file ────────────────────────────────────────
echo "==> Writing server definition..."
mkdir -p servers
cat > "servers/${SERVER_ID}.json" <<EOF
{
  "id": "${SERVER_ID}",
  "name": "DebuggingAI",
  "description": "Universal debugger control for any AI agent — Claude, Cline, Cursor, and more. Exposes VS Code breakpoints, stepping, and variable inspection as MCP tools.",
  "vendor": "mickeyperlstein",
  "version": "${VERSION}",
  "license": "MIT",
  "sourceUrl": "https://github.com/mickeyperlstein/DebuggingAI",
  "dockerImage": "pitronot/debuggingai",
  "categories": ["development", "debugging", "ai"],
  "environment": [
    {
      "name": "DEBUGAI_PORT",
      "description": "Port where the DebuggingAI VS Code extension is listening",
      "default": "7890"
    },
    {
      "name": "DEBUGAI_HOST",
      "description": "Host where the DebuggingAI VS Code extension is listening",
      "default": "127.0.0.1"
    }
  ]
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
    \"body\": \"Adds the DebuggingAI MCP server (v${VERSION}) to the Docker MCP Registry.\\n\\nDocker image: \`pitronot/debuggingai\`\\nSource: https://github.com/mickeyperlstein/DebuggingAI\\n\\nThis server exposes VS Code's full debugger as MCP tools so any AI agent can drive a live debug session.\",
    \"head\": \"${FORK_ORG}:${BRANCH}\",
    \"base\": \"main\"
  }" | jq -r '.html_url')

echo ""
echo "Done. Pull request opened:"
echo "  ${PR_URL}"
echo ""
echo "Docker will review, merge, build, sign, and publish the image."
echo "After merge, users can run:  docker mcp run debugging-ai"
