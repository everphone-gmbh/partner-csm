#!/bin/sh
# Load secrets from the mounted dotenv file into real environment variables
# so they're available to edge runtime workers at module load time.
DOTENV_PATH="${DOTENV_PATH:-/secrets/.env}"
if [ -f "$DOTENV_PATH" ]; then
  echo "Loading env from $DOTENV_PATH"
  set -a
  . "$DOTENV_PATH"
  set +a
fi

exec edge-runtime "$@"
