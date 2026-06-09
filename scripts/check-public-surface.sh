#!/usr/bin/env bash
# Guard: fail if any tracked file in this PUBLIC, customer-facing repo leaks an
# internal technology name, a competitor brand, an AI-brand, or a production
# host/IP. Every tracked file here is a browsable surface and must read as
# client-professional, vendor-neutral copy. Runs in CI on every push/PR.
#
# The sensitive INVENTORY (the actual stack names + IPs to look for) is NOT
# stored in this public script — that would itself be a disclosure. It lives in
# an untracked, gitignored file `scripts/.banned-terms` (one regex term per
# line, '#' comments allowed) that CI provides. This script holds the matching
# LOGIC only.
#
# Usage:  scripts/check-public-surface.sh   (exit 0 clean, 1 on violation)

set -uo pipefail
cd "$(dirname "$0")/.."

TERMS_FILE="scripts/.banned-terms"
if [ ! -f "$TERMS_FILE" ]; then
  echo "WARN: $TERMS_FILE not present — public-surface guard SKIPPED."
  echo "      Provide the banned-terms file (untracked) in CI to enable the check."
  exit 0
fi

# Build the alternation from the terms file (skip blanks + comments).
BANNED="$(grep -vE '^\s*(#|$)' "$TERMS_FILE" | paste -sd '|' -)"
if [ -z "$BANNED" ]; then
  echo "WARN: $TERMS_FILE is empty — nothing to check."
  exit 0
fi

# Known-safe false positives (kept in the public script — these are NOT secret).
ALLOW='trust|crust|every ?day|Daily Ranking|holiday'

hits=0
while IFS= read -r f; do
  while IFS= read -r line; do
    echo "$line" | grep -qiE "$ALLOW" && continue
    echo "  LEAK: $line"
    hits=$((hits+1))
  done < <(grep -InE "$BANNED" "$f" 2>/dev/null)
done < <(git ls-files \
           'docs-site/src/**' 'examples/**' \
           '*.md' '*.mdx' 'LICENSE.md' 'README.md' \
           | grep -vE 'node_modules|/dist/' )

if [ "$hits" -gt 0 ]; then
  echo ""
  echo "FAIL: $hits banned term(s) found in this public repo."
  echo "Use client-professional, vendor-neutral language — describe components"
  echo "by role (media service, signaling service, the cache), never by"
  echo "internal tech or competitor name."
  exit 1
fi
echo "OK: public repo clean (no internal tech / competitor / AI-brand / host leaks)."
exit 0
