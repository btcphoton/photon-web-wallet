#!/bin/bash

# 1. Check if a message was provided
if [ -z "$1" ]; then
  echo "❌ Error: No commit message provided."
  echo "Usage: ./gpush \"Your commit message\""
  exit 1
fi

MESSAGE="$1"

# 2. Add, Commit, and Push
echo "--- 🚀 Starting Git Automation ---"

git add .

# Using "$MESSAGE" ensures spaces in your commit message are handled correctly
git commit -m "$MESSAGE"

if [ $? -eq 0 ]; then
    git push
    echo "--- ✅ Successfully pushed to remote ---"
else
    echo "--- ⚠️ Nothing to commit or git error occurred ---"
fi
