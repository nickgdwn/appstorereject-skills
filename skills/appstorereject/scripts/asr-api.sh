#!/usr/bin/env bash
set -euo pipefail

# App Store Reject API wrapper
# Usage: asr-api.sh <METHOD> <PATH> [JSON_BODY]
#        asr-api.sh --help

BASE_URL="https://modest-ant-119.convex.site"
MAX_RETRIES=2
CONNECT_TIMEOUT=10
MAX_TIME=30

# Resolve API key
get_api_key() {
  if [ -n "${ASR_API_KEY:-}" ]; then
    echo "$ASR_API_KEY"
    return
  fi
  local config="$HOME/.appstorereject/config.json"
  if [ -f "$config" ]; then
    grep -o '"apiKey"[[:space:]]*:[[:space:]]*"[^"]*"' "$config" | head -1 | sed 's/.*"apiKey"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
    return
  fi
  echo ""
}

show_help() {
  cat <<'HELP'
App Store Reject API

Usage: asr-api.sh <METHOD> <PATH> [JSON_BODY]

Methods: GET, POST, DELETE

Endpoints:
  GET  /api/search?q=<query>&store=<apple|google>&limit=<n>
       Search rejections by keyword

  GET  /api/rejections?store=<apple|google>&limit=<n>
       List rejections

  GET  /api/rejections/detail?slug=<slug>
       Single rejection with solutions (auth: full details)

  GET  /api/rejections/batch?slugs=<slug1,slug2,...>
       Batch fetch up to 10 rejections

  GET  /api/categories?store=<apple|google>
       List categories

  GET  /api/guideline-changes?platform=<apple|google>&limit=<n>
       Recent guideline changes

  POST /api/scans/start
       Start a scan (requires auth). Body: {"bundleId":"...","scanType":"first_submission|update"}

  POST /api/scans/complete
       Complete a scan with findings (requires auth)

  POST /api/rejections/report
       Report a rejection event (requires auth)

  GET  /api/auth/me
       Current user info (requires auth)

  GET  /api/auth/api-keys
       List API keys (requires auth)

  POST /api/auth/api-keys
       Create API key (requires auth). Body: {"name":"..."}

  DELETE /api/auth/api-keys?keyId=<id>
       Revoke API key (requires auth)

Authentication:
  Set ASR_API_KEY env var or save to ~/.appstorereject/config.json
  Keys available at https://appstorereject.com/settings/api-keys
HELP
}

# Handle --help
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  show_help
  exit 0
fi

# Validate args
if [ $# -lt 2 ]; then
  echo "Error: Usage: asr-api.sh <METHOD> <PATH> [JSON_BODY]" >&2
  echo "Run with --help for endpoint list" >&2
  exit 1
fi

METHOD="$1"
PATH_ARG="$2"
BODY="${3:-}"
API_KEY=$(get_api_key)

# Write curl config to temp file (keeps API key out of ps aux output)
CURL_CONFIG=$(mktemp)
trap 'rm -f "$CURL_CONFIG"' EXIT

cat > "$CURL_CONFIG" <<CURLCFG
-s
--connect-timeout $CONNECT_TIMEOUT
--max-time $MAX_TIME
-X $METHOD
-H "Content-Type: application/json"
-w "\n%{http_code}"
CURLCFG

if [ -n "$API_KEY" ]; then
  echo "-H \"Authorization: Bearer $API_KEY\"" >> "$CURL_CONFIG"
fi

CURL_ARGS=(-K "$CURL_CONFIG")

if [ -n "$BODY" ]; then
  CURL_ARGS+=(-d "$BODY")
fi

URL="${BASE_URL}${PATH_ARG}"

# Retry loop with exponential backoff
attempt=0
backoff=1
while true; do
  response=$(curl "${CURL_ARGS[@]}" "$URL" 2>/dev/null || echo -e "\n000")

  # Split response body and status code
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  # Handle 401 specifically
  if [ "$http_code" = "401" ]; then
    echo "Error: API key invalid or revoked." >&2
    echo "Generate a new key at https://appstorereject.com/settings/api-keys" >&2
    exit 1
  fi

  # Retry on 5xx or 429 (rate limited)
  if { [ "$http_code" -ge 500 ] 2>/dev/null || [ "$http_code" = "429" ]; } && [ "$attempt" -lt "$MAX_RETRIES" ]; then
    attempt=$((attempt + 1))
    sleep "$backoff"
    backoff=$((backoff * 3))
    continue
  fi

  # Network failure
  if [ "$http_code" = "000" ]; then
    echo "Error: Could not connect to API at $BASE_URL" >&2
    echo "Check your network connection and try again." >&2
    exit 1
  fi

  # Output body
  echo "$body"

  # Exit with error on non-2xx
  if [ "$http_code" -lt 200 ] 2>/dev/null || [ "$http_code" -ge 300 ] 2>/dev/null; then
    exit 1
  fi

  exit 0
done
