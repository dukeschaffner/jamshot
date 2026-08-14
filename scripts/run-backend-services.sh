#!/usr/bin/env bash
# Run local backend services in parallel.
#
# Usage (from repo root):
#   ./scripts/run-backend-services.sh
#   npm run dev:backend
#   JAMSHOT_ENV=ephemeral npm run dev:backend   # env/.env.dev then env/.env.ephemeral
#   npm run ephemeral:setup                     # create DB + write overlay first

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

# Shared local env (env/.env.dev + optional overlays). Children inherit these values.
export JAMSHOT_ENV="${JAMSHOT_ENV:-dev}"
if ! EVAL_ENV="$(node "$ROOT/packages/dev-env/src/print-exports.js")"; then
  echo "Failed to load local env from env/.env.dev" >&2
  echo "Copy env/.env.dev.example to env/.env.dev and fill in values." >&2
  exit 1
fi
eval "$EVAL_ENV"

if [[ "$JAMSHOT_ENV" == "ephemeral" ]]; then
  if [[ ! " ${SERVICES[*]} " =~ " r2 " ]]; then
    SERVICES=(r2 "${SERVICES[@]}")
  fi
fi

DEV_LOG_PORT="${DEV_LOG_PORT:-5099}"
export DEV_LOG_PORT

PIDS=()
NAMES=()
LOG_SERVER_PID=""

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
  if [[ -n "$LOG_SERVER_PID" ]] && kill -0 "$LOG_SERVER_PID" 2>/dev/null; then
    kill_tree "$LOG_SERVER_PID"
    wait "$LOG_SERVER_PID" 2>/dev/null || true
    echo "  stopped DevLog (pid $LOG_SERVER_PID)"
  fi
}

trap cleanup EXIT INT TERM

wait_for_log_server() {
  local attempts=0
  local max_attempts=50
  while (( attempts < max_attempts )); do
    if curl -sf "http://127.0.0.1:${DEV_LOG_PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 0.1
  done
  echo "Dev log server failed to become healthy on port ${DEV_LOG_PORT}" >&2
  return 1
}

start_log_server() {
  echo "Starting DevLog on port ${DEV_LOG_PORT}..."
  node "$ROOT/scripts/dev-log-server/index.js" &
  LOG_SERVER_PID=$!
  if ! wait_for_log_server; then
    exit 1
  fi
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
    "$@" 2>&1 | node "$ROOT/scripts/dev-log-server/bridge.js" --source "$name"
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
    email)      start_service "Email" "functions/lambda/email-notifications" node local.js ;;
    issues)     start_service "Issues" "issues-visualizer" npm run dev ;;
    r2)
      start_service "R2" "scripts/ephemeral-env" "$ROOT/node_modules/.bin/wrangler" dev \
        --ip 127.0.0.1 \
        --port "${R2_PORT:-8787}" \
        --persist-to "$ROOT/.local/ephemeral-r2"
      ;;
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

start_log_server

for service in "${SERVICES[@]}"; do
  launch_service "$service"
done

echo ""
echo "Backend services running (logs via DevLog :${DEV_LOG_PORT}). Ctrl+C to stop all."
echo ""

# If any child exits, stop the rest
while true; do
  if [[ -n "$LOG_SERVER_PID" ]] && ! kill -0 "$LOG_SERVER_PID" 2>/dev/null; then
    echo ""
    echo "DevLog exited — shutting down remaining services."
    exit 1
  fi
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
