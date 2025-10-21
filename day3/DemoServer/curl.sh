#!/usr/bin/env bash

# Usage: ./curl.sh <session-id>
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <session-id>"
  echo "Example: $0 abd02098-7c14-4b4b-9b3c-a7a1c99e8997"
  exit 1
fi

SESSION_ID="$1"

curl -v \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: ${SESSION_ID}" \
  "http://localhost:3000/mcp"