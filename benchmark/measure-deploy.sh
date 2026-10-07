#!/usr/bin/env bash
#
# Deployment timing for the ENPOWER Marketplace Toolkit.
#
# This script instruments the deployment procedure documented in README section
# 4.2. That procedure has two automated phases separated by
# a manual configuration step in the identity provider, so it 
# cannot be reduced to a single figure, and this script does not pretend
# otherwise: it reports image preparation, phase 1 and phase 2 separately, and
# states where the human step falls.
#
#   ./measure-deploy.sh prepare   # copy env files, build images, time the build
#   ./measure-deploy.sh phase1    # start the identity provider, time it
#                                 # ... then do the manual steps it prints ...
#   ./measure-deploy.sh phase2    # start the remaining services, time them
#
# Options:
#   --reset              Before `prepare`, remove containers AND volumes for a
#                        true cold start. This deletes all platform data.
#
# Results accumulate in benchmark/RESULTS.md.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RESULTS="${RESULTS:-benchmark/RESULTS.md}"
TIMEOUT="${TIMEOUT:-600}"

BUILT_SERVICES="backend frontend ingestion-microservice ingestion-dashboard hardhat"
PHASE2_SERVICES="hardhat mongodb postgres mailhog backend ingestion-microservice ingestion-dashboard frontend"

STAGE="${1:-}"
shift 2>/dev/null || true

RESET=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

note() { printf '%s\n' "$*" >> "$RESULTS"; }
say()  { printf '%s\n' "$*" >&2; }

# ── readiness probes, keyed by Compose service name ─────────────────────────

probe() {
  case "$1" in
    hardhat)
      curl -fsS -m 3 -X POST http://localhost:8545 \
        -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
        2>/dev/null | grep -q '"result"' ;;
    mongodb)                (exec 3<>/dev/tcp/127.0.0.1/27018) 2>/dev/null ;;
    postgres)               (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null ;;
    mailhog)                curl -fsS -m 3 -o /dev/null http://localhost:8025/ 2>/dev/null ;;
    # Not published on the host; its Compose healthcheck is the readiness signal.
    keycloak-db)
      [ "$(docker inspect -f '{{.State.Health.Status}}' \
            "$(docker compose ps -q keycloak-db)" 2>/dev/null)" = healthy ] ;;
    keycloak)               curl -fsS -m 5 -o /dev/null http://localhost:8088/realms/enpower-marketplace 2>/dev/null ;;
    backend)                curl -fsS -m 5 -o /dev/null http://localhost:3000/auth/health 2>/dev/null ;;
    frontend)               curl -fsS -m 5 -o /dev/null http://localhost:4200/ 2>/dev/null ;;
    ingestion-microservice) curl -fsS -m 5 -o /dev/null http://localhost:8082/swagger-ui/index.html 2>/dev/null ;;
    ingestion-dashboard)    curl -fsS -m 5 -o /dev/null http://localhost:4201/ 2>/dev/null ;;
    *) return 1 ;;
  esac
}

# Starts the given services and records when each first answers a request.
# Prints a Markdown table and appends it to RESULTS.
time_startup() {
  local label="$1"; shift
  local services="$*"
  local t0 remaining svc t last=0
  declare -A ready=()

  say "Starting: $services"
  t0=$(date +%s.%N)
  if ! docker compose up -d $services >/dev/null 2>&1; then
    say "docker compose up failed. Run it directly to see why."
    return 1
  fi

  elapsed() { echo "$(date +%s.%N) $t0" | awk '{ printf "%.1f", $1 - $2 }'; }

  remaining=$(echo "$services" | wc -w)
  while [ "$remaining" -gt 0 ]; do
    if awk -v e="$(elapsed)" -v t="$TIMEOUT" 'BEGIN { exit !(e > t) }'; then
      say "Timed out after ${TIMEOUT}s with $remaining service(s) not answering."
      break
    fi
    for svc in $services; do
      [ -n "${ready[$svc]:-}" ] && continue
      if probe "$svc"; then
        ready[$svc]=$(elapsed)
        remaining=$((remaining - 1))
        printf '  %-24s ready at %6ss\n' "$svc" "${ready[$svc]}" >&2
      fi
    done
    [ "$remaining" -gt 0 ] && sleep 2
  done

  note ""
  note "#### $label"
  note ""
  note "| Service | Ready after |"
  note "|---|---:|"
  for svc in $services; do
    t="${ready[$svc]:-}"
    if [ -z "$t" ]; then
      note "| $svc | did not answer |"
    else
      note "| $svc | $t s |"
      last=$(echo "$t $last" | awk '{ print ($1 > $2) ? $1 : $2 }')
    fi
  done
  note "| **All of $label answering** | **${last} s** |"
  say ""
}

# ─────────────────────────────────────────────────────────────────────────────

case "$STAGE" in

prepare)
  if [ "$RESET" -eq 1 ]; then
    say "Removing containers and volumes for a cold start."
    say "This deletes all platform data. Press Ctrl-C within 5 s to abort."
    sleep 5
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi

  # README 4.2.2. Copying is idempotent: an existing file is never overwritten,
  # because it may already hold the secrets retrieved in phase 1.
  for pair in ".env.example:.env" "marketplace-be/.env.example:marketplace-be/.env.docker"; do
    src="${pair%%:*}"; dst="${pair##*:}"
    if [ -f "$dst" ]; then
      say "Keeping existing $dst"
    elif [ -f "$src" ]; then
      cp "$src" "$dst"; say "Created $dst from $src"
    else
      say "Missing $src — cannot continue."; exit 1
    fi
  done
  say ""
  say "Set SERVER_URL in .env before phase 2 if this host is reached by address."
  say ""

  : > "$RESULTS"
  note "## Deployment"
  note ""
  note "Measured by instrumenting the procedure in README section 4.2. The"
  note "procedure has two automated phases separated by a manual configuration"
  note "step in the identity provider, so three figures are reported rather than"
  note "one."

  say "Building images for: $BUILT_SERVICES"
  say "On a small host this compiles for several minutes. Output is left visible."
  say ""
  T0=$(date +%s.%N)
  if ! docker compose build $BUILT_SERVICES; then
    say ""
    say "Image preparation failed; the build output above says which image and why."
    exit 1
  fi
  PREP=$(echo "$(date +%s.%N) $T0" | awk '{ printf "%.1f", $1 - $2 }')

  note ""
  note "#### Image preparation"
  note ""
  note "| Step | Time |"
  note "|---|---:|"
  note "| Pull and build $(echo "$BUILT_SERVICES" | wc -w) images | ${PREP} s |"
  note ""
  note "Image preparation recurs only on a code change, whereas the phases below"
  note "recur on every start, so it is reported apart from them."
  say "Images ready after ${PREP}s. Next: ./benchmark/measure-deploy.sh phase1"
  ;;

phase1)
  # README 4.2.3
  time_startup "phase 1, identity provider" keycloak-db keycloak || exit 1
  note ""
  note "A manual configuration step follows phase 1: the deployment's redirect"
  note "URIs are registered with the identity provider and two client secrets are"
  note "retrieved from it and written into the backend environment. That step is"
  note "operator time rather than machine time and is excluded from every figure"
  note "reported here."

  cat >&2 <<'MANUAL'

Now the manual steps, from README 4.2.3 and 4.2.4:

  1. Open http://<this-host>:8088/admin and sign in. The credentials are
     KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD in marketplace-keycloak/.env
  2. Realm enpower-marketplace -> Clients -> frontend -> Settings
     Add http://<this-host>:4200/* to Valid redirect URIs
     Add http://<this-host>:4200   to Web origins, then Save
  3. Clients -> backend   -> Credentials: copy the client secret
     Clients -> admin-cli -> Credentials: copy the client secret
  4. Edit marketplace-be/.env.docker and set:
       KEYCLOAK_CLIENT_SECRET        the backend secret
       KEYCLOAK_ADMIN_CLIENT_SECRET  the admin-cli secret
       ADMIN_PK                      a private key from the Hardhat node
     Leave the contract addresses empty: Compose fills them on startup.

Then: ./benchmark/measure-deploy.sh phase2

MANUAL
  ;;

phase2)
  # Fail before starting anything if the manual step was skipped. Without these
  # the backend starts and then refuses every request, which is a slow and
  # confusing way to discover the same thing.
  ENVF="marketplace-be/.env.docker"
  [ -f "$ENVF" ] || { say "$ENVF does not exist. Run: $0 prepare"; exit 1; }
  for v in KEYCLOAK_CLIENT_SECRET KEYCLOAK_ADMIN_CLIENT_SECRET ADMIN_PK; do
    val="$(grep -E "^${v}=" "$ENVF" | head -1 | cut -d= -f2- | tr -d '[:space:]')"
    case "$val" in
      ""|your-*|0xYOUR_*)
        say "$v is still unset in $ENVF."
        say "Complete the manual steps printed by: $0 phase1"
        exit 1 ;;
    esac
  done

  time_startup "phase 2, remaining services" $PHASE2_SERVICES || exit 1
  note ""
  note "Host: $(uname -srm), $(nproc) CPUs, $(free -g 2>/dev/null | awk '/^Mem:/ { print $2 }') GiB RAM,"
  note "Docker $(docker --version 2>/dev/null | sed 's/Docker version //; s/,.*//'),"
  note "Node $(node --version 2>/dev/null)."
  say "Done. Results in $RESULTS"
  ;;

*)
  # Print the header comment as usage.
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
  exit 2 ;;
esac
