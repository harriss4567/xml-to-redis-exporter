#!/usr/bin/env bash
# Exports subdomains and cookies from an XML file to Redis using docker compose.
#
# Usage: export.sh [-v] /path/to/xml
#   -v   print all keys saved to Redis
set -euo pipefail

usage() {
  echo "Usage: $(basename "$0") [-v] /path/to/xml" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=""
FILE=""

for arg in "$@"; do
  case "$arg" in
    -v|--verbose) VERBOSE="-v" ;;
    -h|--help) usage ;;
    -*) echo "Error: unknown option: $arg" >&2; usage ;;
    *)
      if [[ -n "$FILE" ]]; then
        echo "Error: only one XML file may be given" >&2
        usage
      fi
      FILE="$arg"
      ;;
  esac
done

[[ -n "$FILE" ]] || usage

if [[ ! -f "$FILE" || ! -r "$FILE" ]]; then
  echo "Error: file not found or not readable: $FILE" >&2
  exit 1
fi

# Absolute path so it can be bind-mounted into the container.
ABS_FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Error: docker compose is not installed (https://docs.docker.com/compose/install/)" >&2
  exit 1
fi

COMPOSE+=(-f "$SCRIPT_DIR/docker-compose.yml")

"${COMPOSE[@]}" build --quiet exporter >/dev/null
# `run` also starts Redis (and waits for its healthcheck) via depends_on.
"${COMPOSE[@]}" run --rm \
  -v "$ABS_FILE:/data/input.xml:ro" \
  exporter ${VERBOSE} /data/input.xml
