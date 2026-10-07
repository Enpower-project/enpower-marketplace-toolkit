#!/usr/bin/env bash
#
# Cold deployment timing for the ENPOWER Marketplace Toolkit.
#
# Measures the wall-clock time from `docker compose up` to each service being
# able to answer a request, which is the figure that matters to someone trying to
# reproduce the deployment: not when the container started, but when the stack
# became usable.
#
# Usage:
#   ./measure-deploy.sh                 # bring the stack up and time it
#   ./measure-deploy.sh --reset         # DESTROYS volumes first, for a true cold start
#   ./measure-deploy.sh --no-pull       # skip image pulls, time the build only
#
# Output: a Markdown table on stdout, plus deploy-timing.csv.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RESET=0
PULL=1
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    --no-pull) PULL=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

TIMEOUT="${TIMEOUT:-900}"   # seconds to wait for the whole stack
OUT="${OUT:-benchmark/deploy-timing.csv}"

# ─────────────────────────────────────────────────────────────────────────────
# Readiness probes. Each returns 0 once the service can answer a request.
# Ports are the host-side ports declared in docker-compose.yml.
# ─────────────────────────────────────────────────────────────────────────────

probe_hardhat() {
  curl -fsS -m 3 -X POST http://localhost:8545 \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
    2>/dev/null | grep -q '"result"'
}
probe_mongodb()   { (exec 3<>/dev/tcp/127.0.0.1/27018) 2>/dev/null; }
probe_postgres()  { (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null; }
probe_mailhog()   { curl -fsS -m 3 -o /dev/null http://localhost:8025/ 2>/dev/null; }
probe_keycloak()  { curl -fsS -m 5 -o /dev/null http://localhost:8088/realms/enpower-marketplace 2>/dev/null; }
probe_backend()   { curl -fsS -m 5 -o /dev/null http://localhost:3000/auth/health 2>/dev/null; }
probe_frontend()  { curl -fsS -m 5 -o /dev/null http://localhost:4200/ 2>/dev/null; }
probe_ingestion() { curl -fsS -m 5 -o /dev/null http://localhost:8082/swagger-ui/index.html 2>/dev/null; }
probe_dashboard() { curl -fsS -m 5 -o /dev/null http://localhost:4201/ 2>/dev/null; }

SERVICES=(hardhat mongodb postgres mailhog keycloak backend frontend ingestion dashboard)

declare -A READY_AT=()

# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESET" -eq 1 ]; then
  echo "Removing containers and volumes for a cold start." >&2
  echo "This deletes all platform data. Press Ctrl-C within 5 s to abort." >&2
  sleep 5
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
fi

# Five of the services are built from local Dockerfiles rather than pulled, and
# building them compiles an Angular bundle, a NestJS backend and a Spring
# service. That is image preparation, not deployment: it happens once per code
# change, whereas deployment happens on every start. The two are timed
# separately so that neither figure misrepresents the other.
PREP=""
if [ "$PULL" -eq 1 ]; then
  echo "Preparing images: pulling and building (timed separately)..." >&2
  PREP_T0=$(date +%s.%N)
  docker compose pull --quiet >/dev/null 2>&1 || true
  if ! docker compose build >/dev/null 2>&1; then
    echo "docker compose build failed; run it directly to see why." >&2
    exit 1
  fi
  PREP=$(echo "$(date +%s.%N) $PREP_T0" | awk '{ printf "%.1f", $1 - $2 }')
  echo "  images ready after ${PREP}s" >&2
fi

echo "Starting the stack..." >&2
T0=$(date +%s.%N)
if ! docker compose up -d >/dev/null 2>&1; then
  echo "docker compose up failed; run it directly to see why." >&2
  exit 1
fi

elapsed() { echo "$(date +%s.%N) $T0" | awk '{ printf "%.1f", $1 - $2 }'; }

remaining=${#SERVICES[@]}
while [ "$remaining" -gt 0 ]; do
  now=$(elapsed)
  if awk -v e="$now" -v t="$TIMEOUT" 'BEGIN { exit !(e > t) }'; then
    echo "Timed out after ${TIMEOUT}s with $remaining service(s) not ready." >&2
    break
  fi
  for svc in "${SERVICES[@]}"; do
    [ -n "${READY_AT[$svc]:-}" ] && continue
    if "probe_$svc"; then
      READY_AT[$svc]=$(elapsed)
      remaining=$((remaining - 1))
      printf '  %-12s ready at %6ss\n' "$svc" "${READY_AT[$svc]}" >&2
    fi
  done
  [ "$remaining" -gt 0 ] && sleep 2
done

# ─────────────────────────────────────────────────────────────────────────────

mkdir -p "$(dirname "$OUT")"
echo "service,ready_seconds" > "$OUT"

echo
echo "### Cold deployment timing"
echo
echo "| Service | Ready after |"
echo "|---|---:|"
last=0
for svc in "${SERVICES[@]}"; do
  t="${READY_AT[$svc]:-}"
  if [ -z "$t" ]; then
    echo "| $svc | not ready |"
    echo "$svc," >> "$OUT"
  else
    printf '| %s | %s s |\n' "$svc" "$t"
    echo "$svc,$t" >> "$OUT"
    last=$(echo "$t $last" | awk '{ print ($1 > $2) ? $1 : $2 }')
  fi
done
echo "| **Whole stack usable** | **${last} s** |"
echo
if [ -n "$PREP" ]; then
  echo "Image preparation, pulling and building, took a further ${PREP} s. It is"
  echo "reported separately because it recurs only on a code change, whereas the"
  echo "figures above recur on every start."
  echo
fi
echo "Host: $(uname -srm), $(nproc) CPUs, $(free -g 2>/dev/null | awk '/^Mem:/ { print $2 }') GiB RAM,"
echo "Docker $(docker --version 2>/dev/null | sed 's/Docker version //; s/,.*//')."
