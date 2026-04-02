#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -gt 0 ]]; then
  PATTERN="$1"
else
  PATTERN='mnemonic|seed phrase|private key|api[_-]?key|secret|password|rgb:|bcrt1|tb1|bc1|127\.0\.0\.1:300|89\.117\.52\.115'
fi

echo "PhotonBolt hard-coded value audit"
echo "root: ${ROOT_DIR}"
echo "pattern: ${PATTERN}"
echo

cd "${ROOT_DIR}"

rg -n -i \
  --glob '!dist/**' \
  --glob '!node_modules/**' \
  --glob '!logs/**' \
  --glob '!.git/**' \
  --glob '!*.log' \
  --glob '!*.pdf' \
  --glob '!public/photonlabs.txt' \
  --glob '!.env' \
  --glob '!.env.*' \
  --glob '!coverage/**' \
  --glob '!tmp/**' \
  "${PATTERN}" \
  .
