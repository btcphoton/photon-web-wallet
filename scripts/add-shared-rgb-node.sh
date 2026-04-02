#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/photon-regtest-defaults.sh"

PHOTON_NET_DEFAULT="${PHOTON_REGTEST_DOCKER_NETWORK}"
ISSUER_API_DEFAULT="${PHOTON_REGTEST_ISSUER_API_BASE}"
BITCOIND_CONTAINER_DEFAULT="${PHOTON_REGTEST_BITCOIND_CONTAINER}"
MINE_ADDRESS_DEFAULT="${PHOTON_REGTEST_MINE_ADDRESS}"
ASSET_ID_DEFAULT="${PHOTON_REGTEST_PHO_ASSET_ID}"
CAPACITY_SAT_DEFAULT="32000"
ASSET_AMOUNT_DEFAULT="100"
API_PORT_DEFAULT="3004"
PEER_PORT_DEFAULT="9738"
NODE_NAME_DEFAULT="photon-rln-user-c"
ALIAS_DEFAULT="photon-rln-user-c"
PASSWORD_DEFAULT="photon-user-c-dev-2026"
NODE_ROLE_DEFAULT="user"
REGISTER_NODE_DEFAULT="yes"
RESTART_FAUCET_DEFAULT="yes"
FAUCET_SERVICE_DEFAULT="photon-faucet.service"

say() {
  printf '%s\n' "$*"
}

info() {
  printf 'ℹ️  %s\n' "$*"
}

step() {
  printf '\n🚀 %s\n' "$*"
}

ok() {
  printf '✅ %s\n' "$*"
}

warn() {
  printf '⚠️  %s\n' "$*" >&2
}

fail() {
  printf '❌ %s\n' "$*" >&2
  exit 1
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local reply
  read -r -p "$label [$default_value]: " reply
  if [[ -z "${reply}" ]]; then
    printf '%s' "$default_value"
  else
    printf '%s' "$reply"
  fi
}

prompt_secret_default() {
  local label="$1"
  local default_value="$2"
  local reply
  read -r -s -p "$label [$default_value]: " reply
  printf '\n' >&2
  if [[ -z "${reply}" ]]; then
    printf '%s' "$default_value"
  else
    printf '%s' "$reply"
  fi
}

prompt_yes_no_default() {
  local label="$1"
  local default_value="$2"
  local default_hint="Y/n"
  if [[ "${default_value}" != "yes" ]]; then
    default_hint="y/N"
  fi
  local reply
  read -r -p "$label [$default_hint]: " reply
  reply="$(printf '%s' "${reply}" | tr '[:upper:]' '[:lower:]')"
  if [[ -z "${reply}" ]]; then
    printf '%s' "$default_value"
    return
  fi
  case "${reply}" in
    y|yes) printf 'yes' ;;
    n|no) printf 'no' ;;
    *) printf '%s' "$default_value" ;;
  esac
}

slug_to_label() {
  local raw="$1"
  local stripped="${raw#photon-rln-}"
  stripped="${stripped//-/ }"
  printf '%s' "$stripped" | awk '{ for (i = 1; i <= NF; i++) { $i = toupper(substr($i,1,1)) substr($i,2) } print }'
}

spinner_wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-120}"
  local delay="${4:-1}"
  local spin='-\|/'
  local i=0
  local n=0
  while (( i < attempts )); do
    if curl -sS "$url" >/dev/null 2>&1; then
      printf '\r✅ %s\n' "$label"
      return 0
    fi
    local c="${spin:n++%${#spin}:1}"
    printf '\r%s %s' "$c" "$label"
    sleep "$delay"
    ((i+=1))
  done
  printf '\r'
  return 1
}

spinner_wait_for_channel_ready() {
  local api_url="$1"
  local channel_id="$2"
  local attempts="${3:-90}"
  local delay="${4:-2}"
  local spin='-\|/'
  local i=0
  local n=0
  while (( i < attempts )); do
    local ready
    ready="$(curl -sS "${api_url}/listchannels" | jq -r --arg channel_id "$channel_id" '.channels[]? | select(.channel_id==$channel_id) | .ready // empty' 2>/dev/null || true)"
    local status
    status="$(curl -sS "${api_url}/listchannels" | jq -r --arg channel_id "$channel_id" '.channels[]? | select(.channel_id==$channel_id) | .status // empty' 2>/dev/null || true)"
    if [[ "${ready}" == "true" ]]; then
      printf '\r✅ Channel is ready on %s\n' "$api_url"
      return 0
    fi
    local c="${spin:n++%${#spin}:1}"
    printf '\r%s Waiting for channel to become ready on %s (status: %s)' "$c" "$api_url" "${status:-unknown}"
    sleep "$delay"
    ((i+=1))
  done
  printf '\r'
  return 1
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || fail "Required command not found: $name"
}

require_command docker
require_command curl
require_command jq

say "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
say "🛠️  PhotonBolt Shared RGB Lightning Node Installer"
say "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
say "This installer will:"
say "  1. Start a new RGB Lightning node container"
say "  2. Initialize and unlock it"
say "  3. Connect it to the issuer node"
say "  4. Open a ${PHOTON_REGTEST_PHO_TICKER} RGB channel"
say "  5. Mine regtest blocks"
say "  6. Verify that the channel reaches ready state"
say
say "Each prompt shows its default in brackets. Press Enter to accept it."

NODE_NAME="$(prompt_default 'Node container name' "$NODE_NAME_DEFAULT")"
API_PORT="$(prompt_default 'Node HTTP API port' "$API_PORT_DEFAULT")"
PEER_PORT="$(prompt_default 'Node peer port' "$PEER_PORT_DEFAULT")"
ALIAS="$(prompt_default 'Node alias' "$ALIAS_DEFAULT")"
PASSWORD="$(prompt_secret_default 'Node unlock password' "$PASSWORD_DEFAULT")"
ASSET_ID="$(prompt_default "${PHOTON_REGTEST_PHO_TICKER} RGB asset id" "$ASSET_ID_DEFAULT")"
CAPACITY_SAT="$(prompt_default 'Channel BTC capacity in sats' "$CAPACITY_SAT_DEFAULT")"
ASSET_AMOUNT="$(prompt_default 'Asset amount to place in channel' "$ASSET_AMOUNT_DEFAULT")"
PHOTON_NET="$(prompt_default 'Docker network name' "$PHOTON_NET_DEFAULT")"
ISSUER_API="$(prompt_default 'Issuer API base' "$ISSUER_API_DEFAULT")"
BITCOIND_CONTAINER="$(prompt_default 'bitcoind container name' "$BITCOIND_CONTAINER_DEFAULT")"
MINE_ADDRESS="$(prompt_default "Regtest mining address for ${PHOTON_REGTEST_PHO_TICKER}" "$MINE_ADDRESS_DEFAULT")"
ACCOUNT_REF_DEFAULT="${NODE_NAME}"
LABEL_DEFAULT="$(slug_to_label "${ALIAS}")"
NODE_ROLE="$(prompt_default 'PhotonBolt registry role (issuer/user)' "$NODE_ROLE_DEFAULT")"
ACCOUNT_REF="$(prompt_default 'PhotonBolt account ref to register' "$ACCOUNT_REF_DEFAULT")"
NODE_LABEL="$(prompt_default 'PhotonBolt dashboard label' "$LABEL_DEFAULT")"
REGISTER_NODE="$(prompt_yes_no_default 'Register this node in the faucet backend automatically' "$REGISTER_NODE_DEFAULT")"
FAUCET_SERVICE="$(prompt_default 'Faucet systemd service name' "$FAUCET_SERVICE_DEFAULT")"
RESTART_FAUCET="$(prompt_yes_no_default 'Restart the faucet service after registry update' "$RESTART_FAUCET_DEFAULT")"
DATA_DIR="/tmp/${NODE_NAME}"

if [[ "${REGISTER_NODE}" == "yes" ]]; then
  require_command psql
fi

step "Preflight checks"
docker network inspect "$PHOTON_NET" >/dev/null 2>&1 || fail "Docker network not found: $PHOTON_NET"
curl -sS "${ISSUER_API}/nodeinfo" >/dev/null 2>&1 || fail "Issuer API is not reachable at ${ISSUER_API}"
ok "Issuer node and Docker network look healthy"

step "Starting ${NODE_NAME}"
mkdir -p "$DATA_DIR"
docker rm -f "$NODE_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$NODE_NAME" \
  --network "$PHOTON_NET" \
  -p "127.0.0.1:${API_PORT}:3002" \
  -p "127.0.0.1:${PEER_PORT}:9736" \
  -v "${DATA_DIR}:/user-data" \
  photon-rgb-lightning-node \
  /user-data \
  --daemon-listening-port 3002 \
  --ldk-peer-listening-port 9736 \
  --network regtest \
  --disable-authentication >/dev/null
ok "Container started"

step "Waiting for node API"
spinner_wait_for_url "http://127.0.0.1:${API_PORT}/nodeinfo" "Waiting for ${NODE_NAME} API on port ${API_PORT}" || fail "Node API did not come up in time"

step "Initializing node"
INIT_JSON="$(curl -sS -X POST "http://127.0.0.1:${API_PORT}/init" \
  -H 'Content-Type: application/json' \
  -d "{
    \"password\":\"${PASSWORD}\",
    \"bitcoind_rpc_username\":\"user\",
    \"bitcoind_rpc_password\":\"password\",
    \"bitcoind_rpc_host\":\"photon-bitcoind\",
    \"bitcoind_rpc_port\":18443,
    \"indexer_url\":\"tcp://photon-electrs:50001\",
    \"proxy_endpoint\":\"rpc://photon-rgb-proxy:3000/json-rpc\",
    \"announce_addresses\":[],
    \"announce_alias\":\"${ALIAS}\"
  }")"
MNEMONIC="$(printf '%s' "$INIT_JSON" | jq -r '.mnemonic // empty')"
[[ -n "$MNEMONIC" ]] || fail "Node init did not return a mnemonic"
ok "Node initialized"

step "Unlocking node"
curl -sS -X POST "http://127.0.0.1:${API_PORT}/unlock" \
  -H 'Content-Type: application/json' \
  -d "{
    \"password\":\"${PASSWORD}\",
    \"bitcoind_rpc_username\":\"user\",
    \"bitcoind_rpc_password\":\"password\",
    \"bitcoind_rpc_host\":\"photon-bitcoind\",
    \"bitcoind_rpc_port\":18443,
    \"indexer_url\":\"tcp://photon-electrs:50001\",
    \"proxy_endpoint\":\"rpc://photon-rgb-proxy:3000/json-rpc\",
    \"announce_addresses\":[],
    \"announce_alias\":\"${ALIAS}\"
  }" >/dev/null
ok "Node unlocked"

step "Discovering new node identity"
NODE_INFO="$(curl -sS "http://127.0.0.1:${API_PORT}/nodeinfo")"
NODE_PUBKEY="$(printf '%s' "$NODE_INFO" | jq -r '.pubkey')"
NODE_IP="$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$NODE_NAME")"
[[ -n "$NODE_PUBKEY" && -n "$NODE_IP" ]] || fail "Unable to determine new node pubkey or IP"
ok "Node pubkey: ${NODE_PUBKEY}"
ok "Node IP: ${NODE_IP}"

step "Connecting issuer to new node"
curl -sS -X POST "${ISSUER_API}/connectpeer" \
  -H 'Content-Type: application/json' \
  -d "{\"peer_pubkey_and_addr\":\"${NODE_PUBKEY}@${NODE_IP}:9736\"}" >/dev/null
ok "Issuer connected to ${NODE_NAME}"

step "Opening RGB channel from issuer"
OPEN_JSON="$(curl -sS -X POST "${ISSUER_API}/openchannel" \
  -H 'Content-Type: application/json' \
  -d "{
    \"peer_pubkey_and_opt_addr\":\"${NODE_PUBKEY}\",
    \"capacity_sat\":${CAPACITY_SAT},
    \"push_msat\":0,
    \"public\":false,
    \"with_anchors\":true,
    \"fee_base_msat\":0,
    \"fee_proportional_millionths\":0,
    \"temporary_channel_id\":null,
    \"asset_id\":\"${ASSET_ID}\",
    \"asset_amount\":${ASSET_AMOUNT}
  }")"
TEMP_CHANNEL_ID="$(printf '%s' "$OPEN_JSON" | jq -r '.temporary_channel_id // empty')"
ok "Open channel request sent"

step "Mining confirmation blocks"
docker exec "$BITCOIND_CONTAINER" bitcoin-cli -regtest generatetoaddress 2 "$MINE_ADDRESS" >/dev/null
ok "Regtest blocks mined"

step "Finding the new channel"
CHANNEL_ID=""
for _ in $(seq 1 20); do
  CHANNEL_ID="$(curl -sS "http://127.0.0.1:${API_PORT}/listchannels" | jq -r --arg peer "$NODE_PUBKEY" '.channels[]? | select(.channel_id != null) | .channel_id' | head -n 1)"
  if [[ -n "$CHANNEL_ID" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$CHANNEL_ID" ]]; then
  warn "Channel id was not discovered immediately. Printing current channel list instead."
  curl -sS "http://127.0.0.1:${API_PORT}/listchannels" | jq .
else
  ok "Channel id: ${CHANNEL_ID}"
fi

step "Waiting for channel readiness"
if [[ -n "$CHANNEL_ID" ]]; then
  if spinner_wait_for_channel_ready "http://127.0.0.1:${API_PORT}" "$CHANNEL_ID"; then
    READY_STATE="ready"
  else
    READY_STATE="not_ready_yet"
    warn "Channel has not reached ready state within the wait window. It may still settle shortly."
  fi
else
  READY_STATE="unknown"
  warn "Channel id unavailable, skipping ready poll."
fi

SHORT_CHANNEL_ID="$(curl -sS "http://127.0.0.1:${API_PORT}/listchannels" | jq -r --arg channel_id "$CHANNEL_ID" '.channels[]? | select(.channel_id==$channel_id) | .short_channel_id // empty')"

say
say "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
say "🎉 Installer Summary"
say "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
say "Node name        : ${NODE_NAME}"
say "Alias            : ${ALIAS}"
say "API endpoint     : http://127.0.0.1:${API_PORT}"
say "Peer endpoint    : ${NODE_IP}:9736 (host port ${PEER_PORT})"
say "Pubkey           : ${NODE_PUBKEY}"
say "Channel id       : ${CHANNEL_ID:-pending}"
say "Short channel id : ${SHORT_CHANNEL_ID:-pending}"
say "Ready state      : ${READY_STATE}"
say "Mnemonic         : ${MNEMONIC}"
say
if [[ "${REGISTER_NODE}" == "yes" ]]; then
  step "Registering node in the faucet backend registry"
  psql -d photon_rgb_wallets \
    -v account_ref="${ACCOUNT_REF}" \
    -v label="${NODE_LABEL}" \
    -v api_base="http://127.0.0.1:${API_PORT}" \
    -v role="${NODE_ROLE}" <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS rgb_nodes (
  account_ref TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  api_base TEXT NOT NULL,
  role TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rgb_nodes (account_ref, label, api_base, role, enabled, sort_order, metadata)
VALUES (
  :'account_ref',
  :'label',
  :'api_base',
  :'role',
  TRUE,
  100,
  jsonb_build_object('installed_by', 'add-shared-rgb-node.sh', 'registered_at', NOW()::text)
)
ON CONFLICT (account_ref)
DO UPDATE SET
  label = EXCLUDED.label,
  api_base = EXCLUDED.api_base,
  role = EXCLUDED.role,
  enabled = TRUE,
  metadata = COALESCE(rgb_nodes.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = NOW();
SQL
  ok "Registry row upserted for ${ACCOUNT_REF}"

  if [[ "${RESTART_FAUCET}" == "yes" ]]; then
    step "Restarting ${FAUCET_SERVICE}"
    sudo systemctl restart "${FAUCET_SERVICE}"
    ok "Faucet service restarted"
    if curl -sS "http://127.0.0.1:8788/api/status" >/dev/null 2>&1; then
      ok "Faucet backend responded after restart"
    else
      warn "Faucet backend did not respond immediately on /api/status. Check service logs if needed."
    fi
  else
    warn "Registry updated, but faucet was not restarted. Restart ${FAUCET_SERVICE} before using the new node in PhotonBolt."
  fi
fi

say
say "Suggested follow-up checks:"
say "  curl -sS http://127.0.0.1:${API_PORT}/nodeinfo | jq"
say "  curl -sS http://127.0.0.1:${API_PORT}/listchannels | jq"
if [[ "${REGISTER_NODE}" == "yes" ]]; then
  say "  psql -d photon_rgb_wallets -c \"SELECT account_ref, label, api_base, role, enabled FROM rgb_nodes ORDER BY sort_order, account_ref;\""
fi
