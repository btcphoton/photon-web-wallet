#!/bin/bash 
if [ $# -eq 0 ]; then
    echo "Error: Please provide a commit message"
    exit 1
fi

npm run build || exit 1
git add .
git commit -m "$1"
git push