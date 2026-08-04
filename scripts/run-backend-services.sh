#!/usr/bin/env bash
# Run local backend services in parallel.
#
# Usage (from repo root):
#   ./scripts/run-backend-services.sh
#   npm run dev:backend

# =============================================================================
# Toggle: comment out any service you don't want to run
# =============================================================================
SERVICES=(
  api
  stripe
  audio
  # video
  project-ws
  # email
  # issues
)
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PIDS=()
NAMES=()

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  echo ""
  echo "Stopping backend services..."
  for i in "${!PIDS[@]}"; do
    local pid="${PIDS[$i]}"
    local name="${NAMES[$i]}"
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid"
      wait "$pid" 2>/dev/null || true
      echo "  stopped $name (pid $pid)"
    fi
  done
}

trap cleanup EXIT INT TERM

prefix_output() {
  local name="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '[%s] %s\n' "$name" "$line"
  done
}

# start_service NAME WORKDIR COMMAND [ARGS...]
start_service() {
  local name="$1"
  local workdir="$2"
  shift 2

  local dir="$ROOT"
  if [[ -n "$workdir" ]]; then
    dir="$ROOT/$workdir"
  fi

  echo "Starting $name..."
  (
    cd "$dir"
    "$@" 2>&1 | prefix_output "$name"
  ) &
  PIDS+=($!)
  NAMES+=("$name")
}

launch_service() {
  case "$1" in
    api)        start_service "API" "api/lambda" npm run dev ;;
    stripe)     start_service "Stripe" "" stripe listen --forward-to localhost:5001/api/payments/webhook ;;
    audio)      start_service "Audio" "functions/lambda/audio-processing" npm run dev ;;
    video)      start_service "Video" "functions/lambda/video-export" npm run dev ;;
    project-ws) start_service "ProjectWS" "functions/lambda/project-ws" npm run dev ;;
    email)      start_service "Email" "functions/lambda/email-notifications" node index.js ;;
    issues)     start_service "Issues" "issues-visualizer" npm run dev ;;
    *)
      echo "Unknown service: $1" >&2
      exit 1
      ;;
  esac
}

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  echo "No services enabled. Uncomment entries in SERVICES at the top of this script."
  exit 1
fi

for service in "${SERVICES[@]}"; do
  launch_service "$service"
done

echo ""
echo "Backend services running. Ctrl+C to stop all."
echo ""

# If any child exits, stop the rest
while true; do
  for i in "${!PIDS[@]}"; do
    if ! kill -0 "${PIDS[$i]}" 2>/dev/null; then
      wait "${PIDS[$i]}" 2>/dev/null || true
      echo ""
      echo "${NAMES[$i]} exited — shutting down remaining services."
      exit 1
    fi
  done
  sleep 1
done
