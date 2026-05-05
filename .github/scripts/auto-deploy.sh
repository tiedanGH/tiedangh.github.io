#!/usr/bin/env bash
set -euo pipefail

info() {
  echo -e "\033[1;34m[INFO] $*\033[0m"
}

success() {
  echo -e "\033[1;32m[SUCCESS] $*\033[0m"
}

error() {
  echo -e "\033[1;31m[ERROR] $*\033[0m"
}

print_error_response() {
  local body="$1"

  if echo "$body" | jq -e . >/dev/null 2>&1; then
    local error_msg
    error_msg=$(echo "$body" | jq -r '"Error: \(.error // "")\nExit Code: \(.exit_code // "")\nMessage:\n\(.message // "")"')
    while IFS= read -r line; do
      error "$line"
    done <<< "$error_msg"
  else
    error "Full response:"
    echo "$body"
    error "Response body is not valid JSON; raw body was printed above."
  fi
}

json_value() {
  local body="$1"
  local filter="$2"

  if echo "$body" | jq -e . >/dev/null 2>&1; then
    echo "$body" | jq -r "$filter"
  fi

  return 0
}

info "Sending POST request for project '$PROJECT_NAME'..."

response=$(curl -s -w "\n%{http_code}" --max-time 180 -X POST \
  -H "token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PROJECT_NAME\"}" \
  "$SERVER/pull")

body=$(echo "$response" | sed '$d')
status=$(echo "$response" | tail -n1)

if [[ $status =~ ^2 ]]; then
  message=$(json_value "$body" '.message // empty')

  if [[ -n "$message" ]]; then
    success "deploy to server successfully."
    echo "$message"
  else
    error "Server did not return a message."
    print_error_response "$body"
    exit 1
  fi
else
  error "Deployment failed with status $status"
  print_error_response "$body"
  exit 1
fi
