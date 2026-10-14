#!/usr/bin/env bash
set -euo pipefail

pnpm api:generate
git diff --exit-code -- apps/api/openapi/openapi.json packages/api-client/src/schema.d.ts
