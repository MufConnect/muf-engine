#!/usr/bin/env bash
# Guard: fail if any file in this PUBLIC, customer-facing repo leaks an
# internal technology name, a competitor brand, an AI-brand, or the
# production server IP. This repo is browsable by anyone, so every tracked
# file is a served surface and must read as client-professional, vendor-
# neutral copy. Runs in CI on every push/PR.
#
# Usage:  scripts/check-public-surface.sh   (exit 0 clean, 1 on violation)

set -uo pipefail
cd "$(dirname "$0")/.."

TECH='mediasoup|media-sfu|signaling-server|chat-engine|webrtc-rs|\bRust\b|\bAxum\b|\btokio\b|FastAPI|\bPostgres\b|\bValkey\b|\bnginx\b|\bcertbot\b|MEDIASOUP_|POSTGRES_|VALKEY_'
COMPETITORS='\bAgora\b|\bTwilio\b|\bLiveKit\b|\b100ms\b|daily\.co|\bTwitch\b|\bTikTok\b|\bZoom\b|\bInstagram\b|\bYouTube\b'
AI_BRANDS='\bOpenAI\b|\bChatGPT\b|\bAnthropic\b|\bClaude\b|\bGemini\b'
INFRA='161\.35\.127\.122'
BANNED="${TECH}|${COMPETITORS}|${AI_BRANDS}|${INFRA}"
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
echo "OK: public repo clean (no internal tech / competitor / AI-brand / IP leaks)."
exit 0
