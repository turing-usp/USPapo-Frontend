#!/bin/sh
# EAS Update for one channel: sh scripts/update.sh <preview|production> [eas update flags]
# `--environment` makes eas-cli skip .env files (EXPO_NO_DOTENV), so the public client config is
# exported here; without it the bundle ships without Supabase and falls back to the embedded one.
set -eu
canal="$1"; shift
set -a; . ./.env.production; set +a
EXPO_UPDATES_CHANNEL="$canal" exec npx eas-cli update --channel "$canal" --environment "$canal" "$@"
