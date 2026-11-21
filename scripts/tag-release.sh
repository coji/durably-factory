#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 0 && ( $# -ne 2 || "$1" != --push ) ]]; then
  echo 'Usage: pnpm release:tag [--push vX.Y.Z]' >&2
  exit 2
fi

repo=coji/durably-factory
git fetch origin main
commit=$(git rev-parse origin/main)
remote_main=$(gh api "repos/$repo/git/ref/heads/main" --jq .object.sha)
if [[ "$commit" != "$remote_main" ]]; then
  echo "origin/main does not match $repo/main. Check origin and fetch again." >&2
  exit 1
fi

version=$(git show "$commit:package.json" | node -p 'JSON.parse(require("node:fs").readFileSync(0, "utf8")).version')
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Expected a stable npm version in package.json, got $version." >&2
  exit 1
fi
tag="v$version"
if [[ ${1:-} == --push && "$2" != "$tag" ]]; then
  echo "Requested $2, but main declares $tag. Run pnpm release:tag to check again." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/tags/$tag"; then
  echo "Local tag $tag already exists. See docs/maintainer.md for recovery." >&2
  exit 1
fi
if [[ -n "$(git ls-remote --tags origin "refs/tags/$tag")" ]]; then
  echo "Remote tag $tag already exists. See docs/maintainer.md for recovery." >&2
  exit 1
fi
node --input-type=module - "$version" <<'JS'
const version = process.argv[2]
const response = await fetch(
  'https://registry.npmjs.org/@coji%2fdurably-factory',
  { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000) },
)
if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`)
const metadata = await response.json()
const latest = metadata['dist-tags'].latest
const [candidate, current] = [version, latest].map((value) => value.split('.').map(BigInt))
const difference = candidate.findIndex((part, index) => part !== current[index])
const isNewer = difference !== -1 && candidate[difference] > current[difference]
if (Object.hasOwn(metadata.versions, version) || !isNewer) {
  console.error(`Expected an unpublished version newer than npm latest (${latest}), got ${version}.`)
  process.exitCode = 1
}
JS
check=$(gh run list --repo "$repo" --workflow CI --branch main --commit "$commit" --limit 1 --json conclusion --jq '.[0].conclusion // ""')
if [[ "$check" != success ]]; then
  echo "CI has not passed for main at $commit." >&2
  exit 1
fi

printf 'Release %s from %s (%s)\n' "$tag" "$repo/main" "$commit"
if [[ ${1:-} == --push ]]; then
  git tag -a "$tag" "$commit" -m "Durably Factory $version"
  git push origin "refs/tags/$tag"
else
  printf 'To publish: pnpm release:tag --push %s\n' "$tag"
fi
