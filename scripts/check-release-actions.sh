#!/usr/bin/env bash
set -euo pipefail

# Check that GitHub can resolve each pinned action before the release job uses it.
pins=$(awk '$1 == "-" && $2 == "uses:" { print $3 }' .github/workflows/release.yml)
if [[ -z "$pins" ]]; then
  echo 'No actions found in the release workflow.' >&2
  exit 1
fi
while IFS=@ read -r action sha; do
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Expected a pinned commit for $action." >&2
    exit 1
  fi
  if ! gh api "repos/$action/commits/$sha" --silent; then
    echo "Cannot resolve release action $action@$sha." >&2
    exit 1
  fi
done <<< "$pins"
