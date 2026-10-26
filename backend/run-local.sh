#!/usr/bin/env bash
# Starts the backend with local secrets from backend/.env.local.
# Usage: ./run-local.sh [extra gradle args]
set -euo pipefail

cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME_21:-/c/Program Files/Java/jdk-21.0.12.1}"
export PATH="$JAVA_HOME/bin:$PATH"

if ! java -version 2>&1 | grep -q 'version "21'; then
  echo "ERROR: JAVA_HOME must point to JDK 21 ($JAVA_HOME)" >&2
  java -version >&2 || true
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "ERROR: backend/.env.local is missing. Copy .env.example and fill in values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

if [ -z "${DB_URL:-}" ]; then
  export DB_URL="jdbc:mysql://${DB_HOST:-127.0.0.1}:${DB_PORT:-3306}/${DB_NAME:-zz_dev}?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf8&connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true"
fi

: "${APP_DEVICE_PEPPER:?APP_DEVICE_PEPPER is required}"
: "${APP_EXPORT_TOKEN_KEY:?APP_EXPORT_TOKEN_KEY is required}"

echo "Starting backend on port ${SERVER_PORT:-8080} (DB ${DB_NAME:-zz_dev}, Redis DB ${REDIS_DATABASE:-0})"
exec ./gradlew bootRun "$@"
