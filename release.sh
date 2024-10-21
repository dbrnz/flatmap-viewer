#!/bin/sh

git status | grep -q "nothing to commit"
dirty=($? != 0)
if (( dirty )); then
    git stash -u
fi

git push upstream
git push upstream v$1
gh release create v$1 --verify-tag --title "Release $1" --notes ""

npm publish

if (( dirty )); then
    git stash pop --quiet
fi
