#!/bin/sh
# Copy this directory (Lab6/pwa of the course repository) into the public repository ibks-repos/qrauth-pwa
# and push it; GitHub Actions there tests, builds and deploys to GitHub Pages.
#
# Usage: scripts/publish.sh [-n] [message]     -n: prepare the commit but do not push
set -eu

REMOTE=${QRAUTH_PUBLISH_REMOTE:-https://github.com/ibks-repos/qrauth-pwa.git}
# The public repository is published under the author's pseudonym.
AUTHOR_NAME=${QRAUTH_PUBLISH_NAME:-myrzh}
AUTHOR_EMAIL=${QRAUTH_PUBLISH_EMAIL:-49148712+myrzh@users.noreply.github.com}
HERE=$(cd "$(dirname "$0")/.." && pwd)
WORK="$HERE/.publish"

push=1
if [ "${1:-}" = "-n" ]; then push=0; shift; fi
message=${1:-"Update from the course repository"}

if [ ! -d "$WORK/.git" ]; then
	git clone --quiet "$REMOTE" "$WORK"
fi
git -C "$WORK" config user.name "$AUTHOR_NAME"
git -C "$WORK" config user.email "$AUTHOR_EMAIL"
# GIT_AUTHOR_* and GIT_COMMITTER_* in the environment override git config, so set them too.
export GIT_AUTHOR_NAME="$AUTHOR_NAME" GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL"
export GIT_COMMITTER_NAME="$AUTHOR_NAME" GIT_COMMITTER_EMAIL="$AUTHOR_EMAIL"
git -C "$WORK" fetch --quiet origin
if git -C "$WORK" rev-parse --verify --quiet origin/main >/dev/null; then
	git -C "$WORK" checkout --quiet -B main origin/main
else
	git -C "$WORK" checkout --quiet --orphan main 2>/dev/null || true
fi

# Mirror the sources: files ignored by .gitignore (node_modules, dist, .publish) are excluded.
rsync -a --delete --exclude .git --exclude .publish --exclude node_modules --exclude dist \
	--exclude test-results --exclude playwright-report --exclude .DS_Store "$HERE/" "$WORK/"

source_rev=$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo unknown)
dirty=""
if [ -n "$(git -C "$HERE" status --porcelain -- . 2>/dev/null)" ]; then dirty=" (with uncommitted changes)"; fi

git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
	echo "nothing to publish"
	exit 0
fi
git -C "$WORK" commit --quiet -m "$message" -m "Source: course repository, Lab6/pwa at $source_rev$dirty."
git -C "$WORK" log -1 --format='%h %s (author %an <%ae>, committer %cn <%ce>)'
if git -C "$WORK" log -1 --format='%an %ae %cn %ce' | grep -qv "^$AUTHOR_NAME $AUTHOR_EMAIL $AUTHOR_NAME $AUTHOR_EMAIL\$"; then
	echo "refusing to push: the commit identity is not $AUTHOR_NAME <$AUTHOR_EMAIL>" >&2
	exit 1
fi
git -C "$WORK" diff --stat HEAD~1 2>/dev/null | tail -1 || true

if [ "$push" = 1 ]; then
	git -C "$WORK" push --quiet origin main
	echo "pushed to $REMOTE"
else
	echo "not pushed (-n)"
fi
