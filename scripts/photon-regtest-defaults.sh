#!/usr/bin/env bash

# Shared PhotonBolt regtest constants used by local scripts and docs.
# Override any of these with environment variables before invoking a script.

: "${PHOTON_REGTEST_DOCKER_NETWORK:=photonboltxyz_photon}"
: "${PHOTON_REGTEST_ISSUER_API_BASE:=http://127.0.0.1:3001}"
: "${PHOTON_REGTEST_BITCOIND_CONTAINER:=photon-bitcoind}"
: "${PHOTON_REGTEST_MINE_ADDRESS:=bcrt1q4d9v3729r5wzll48wvj00vsa0eznjz5zz55jmh}"
: "${PHOTON_REGTEST_PHO_ASSET_ID:=rgb:2Mhfmuc0-BqWCUwP-kkJKF_V-F1~L4j6-A1_W6Yy-hK6Z~rA}"
: "${PHOTON_REGTEST_PHO_TICKER:=PHO}"
: "${PHOTON_REGTEST_PHO_NAME:=Photon Token}"
