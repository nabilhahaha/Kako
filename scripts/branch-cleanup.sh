#!/usr/bin/env bash
# Branch consolidation cleanup — run with a credential that has full push rights
# to origin (the session sandbox only permits pushing main + the pilot branch,
# so this must run from a maintainer environment / CI with repo write access).
#
# Safety: every UNIQUE-code branch is preserved as an archive/<branch> tag BEFORE
# deletion (instantly restorable: `git branch <b> archive/<b>`). MERGED branches
# carry no unique code (already in main) so they are deleted without a tag.
# KEEPS: main, claude/fmcg-sell-collect-loop.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch origin --prune

UNIQUE=scripts/branch-cleanup-archive-then-delete.txt   # tag + delete
MERGED=scripts/branch-cleanup-delete-merged.txt         # delete only

echo "== 1) create + push archive tags for unique-code branches =="
while read -r b; do [ -z "$b" ] && continue
  git tag -f "archive/$b" "origin/$b"
done < "$UNIQUE"
git push origin "refs/tags/archive/*"

echo "== 2) delete unique-code branches (archived above) =="
xargs -a "$UNIQUE" -r -n 40 git push origin --delete

echo "== 3) delete fully-merged branches (no unique code) =="
xargs -a "$MERGED" -r -n 40 git push origin --delete

echo "== 4) verify only main + pilot remain =="
git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##' | sort
