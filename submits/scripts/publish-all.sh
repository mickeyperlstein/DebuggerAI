#!/usr/bin/env bash
# publish-all.sh
#
# Orchestrates publishing DebuggingAI to every marketplace and registry.
# Runs each script in the correct dependency order.
#
# USAGE
#   Publish everything:
#     ./submits/scripts/publish-all.sh
#
#   Skip specific steps:
#     SKIP_NPM=1 SKIP_DOCKER=1 ./submits/scripts/publish-all.sh
#
#   Skip PR submissions (only automated publishes):
#     SKIP_PRS=1 ./submits/scripts/publish-all.sh
#
# ENVIRONMENT VARIABLES
#   Required secrets (set in shell or GitHub Actions):
#     VSCE_PAT             VS Code Marketplace personal access token
#     OVSX_PAT             Open VSX Registry access token
#     NPM_TOKEN            npm automation token (or NODE_AUTH_TOKEN)
#     SMITHERY_API_KEY     Smithery API key
#     GITHUB_TOKEN         GitHub token (for PR submissions; built-in in CI)
#
#   Optional skip flags (set to any non-empty value to skip):
#     SKIP_NPM             Skip npm publish
#     SKIP_VSCODE          Skip VS Code Marketplace
#     SKIP_OPENVSX         Skip Open VSX
#     SKIP_SMITHERY        Skip Smithery
#     SKIP_MCP_REGISTRY    Skip Official MCP Registry
#     SKIP_DOCKER          Skip Docker MCP Registry PR
#     SKIP_MCPMUX          Skip McpMux PR
#     SKIP_PRS             Skip all PR submissions (Docker + McpMux)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

step()  { echo -e "\n${CYAN}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
skip()  { echo -e "${YELLOW}⏭  Skipping: $1${RESET}"; }
fail()  { echo -e "${RED}✗ $1${RESET}"; }

# ── Result tracking ───────────────────────────────────────────────────────────
declare -A RESULTS

run_step() {
  local name="$1"
  local script="$2"
  shift 2

  if [[ -n "${!name:-}" ]]; then
    skip "${name} (SKIP_${name} is set)"
    RESULTS["${name}"]="skipped"
    return 0
  fi

  step "${name}"
  if bash "${SCRIPT_DIR}/${script}" "$@"; then
    ok "${name} completed"
    RESULTS["${name}"]="ok"
  else
    fail "${name} FAILED (exit code $?)"
    RESULTS["${name}"]="FAILED"
    # Non-PR steps are fatal; PR steps are non-fatal
    if [[ "${script}" != submit-* ]]; then
      echo "Aborting: downstream steps depend on this one."
      exit 1
    fi
  fi
}

# ── Publish order (dependencies first) ───────────────────────────────────────

# 1. npm — required by Smithery and Official MCP Registry
run_step "SKIP_NPM" "publish-npm.sh"

# 2. VS Code Marketplace
run_step "SKIP_VSCODE" "publish-vscode-marketplace.sh"

# 3. Open VSX (reuses the .vsix built in step 2 if present)
run_step "SKIP_OPENVSX" "publish-openvsx.sh"

# 4. Smithery (requires npm published)
run_step "SKIP_SMITHERY" "publish-smithery.sh"

# 5. Official MCP Registry (requires npm published)
run_step "SKIP_MCP_REGISTRY" "publish-official-mcp-registry.sh"

# 6 & 7. PR submissions — non-fatal, async (merged by third parties)
if [[ -n "${SKIP_PRS:-}" ]]; then
  skip "All PR submissions (SKIP_PRS is set)"
  RESULTS["SKIP_DOCKER"]="skipped"
  RESULTS["SKIP_MCPMUX"]="skipped"
else
  run_step "SKIP_DOCKER" "submit-docker-mcp-registry.sh"
  run_step "SKIP_MCPMUX" "submit-mcpmux.sh"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
printf "%-32s %s\n" "Step" "Result"
printf "%-32s %s\n" "----" "------"
for key in SKIP_NPM SKIP_VSCODE SKIP_OPENVSX SKIP_SMITHERY SKIP_MCP_REGISTRY SKIP_DOCKER SKIP_MCPMUX; do
  label="${key#SKIP_}"
  result="${RESULTS[${key}]:-not run}"
  if [[ "${result}" == "ok" ]]; then
    printf "%-32s ${GREEN}%s${RESET}\n" "${label}" "${result}"
  elif [[ "${result}" == "skipped" ]]; then
    printf "%-32s ${YELLOW}%s${RESET}\n" "${label}" "${result}"
  else
    printf "%-32s ${RED}%s${RESET}\n" "${label}" "${result}"
  fi
done
echo ""
