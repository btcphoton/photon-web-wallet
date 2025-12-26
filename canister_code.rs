use ic_cdk::api::caller;
use ic_cdk::api::management_canister::ecdsa::{
    ecdsa_public_key, sign_with_ecdsa, EcdsaCurve, EcdsaKeyId, EcdsaPublicKeyArgument, SignWithEcdsaArgument,
};
// CONSOLIDATED BITCOIN IMPORTS
use ic_cdk::api::management_canister::bitcoin::{
    bitcoin_get_utxos, 
    bitcoin_get_current_fee_percentiles, 
    bitcoin_send_transaction,
    bitcoin_get_balance,
    BitcoinNetwork as IcpBitcoinNetwork, 
    GetUtxosRequest,
    GetCurrentFeePercentilesRequest,
    SendTransactionRequest,
    GetBalanceRequest,
    Utxo,
    MillisatoshiPerByte, 
};
use bitcoin::{
    Address, Network, PublicKey, Transaction, TxIn, TxOut, OutPoint, 
    Witness, ScriptBuf, Txid,
    sighash::{SighashCache, EcdsaSighashType},
    consensus::Encodable,
};
use bitcoin::hashes::Hash; 
use bitcoin::secp256k1::ecdsa::Signature;
use candid::{CandidType, Deserialize, Principal, Decode, Encode};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    DefaultMemoryImpl, StableBTreeMap, Storable, storable::Bound,
};
use serde::Serialize;
use std::borrow::Cow;
use std::cell::RefCell;
use std::str::FromStr;

// --- CONSTANTS FOR TESTNET ---
const BITCOIN_NETWORK: Network = Network::Testnet;
const ICP_BITCOIN_NETWORK: IcpBitcoinNetwork = IcpBitcoinNetwork::Testnet;
const KEY_NAME: &str = "test_key_1"; 

// --- MANUAL SCHNORR DEFINITIONS ---
#[derive(CandidType, Serialize, Deserialize, Debug, Clone, Copy)]
pub enum SchnorrAlgorithm {
    #[serde(rename = "bip340secp256k1")]
    Bip340Secp256k1,
    #[serde(rename = "ed25519")]
    Ed25519,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct SchnorrKeyId {
    pub algorithm: SchnorrAlgorithm,
    pub name: String,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct SchnorrPublicKeyArgument {
    pub canister_id: Option<Principal>,
    pub algo: SchnorrAlgorithm,
    pub key_id: SchnorrKeyId,
    pub derivation_path: Vec<Vec<u8>>,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct SchnorrPublicKeyResponse {
    pub public_key: Vec<u8>,
    pub chain_code: Vec<u8>,
}

// --- TYPE DEFINITIONS ---
type Memory = VirtualMemory<DefaultMemoryImpl>;
type ConsignmentId = u64;
type ChunkIndex = u32;

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct AddressInfo {
    pub address: String,
    pub balance_sats: u64,
    pub utxo_count: u32,
    pub utxos: Vec<Utxo>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct ConsignmentMetadata {
    pub id: ConsignmentId,
    pub owner: Principal,
    pub filename: String,
    pub total_chunks: u32,
    pub total_size: u64,
    pub content_type: String, 
    pub created_at: u64,
}

impl Storable for ConsignmentMetadata {
    fn to_bytes(&self) -> Cow<[u8]> { Cow::Owned(Encode!(self).unwrap()) }
    fn from_bytes(bytes: Cow<[u8]>) -> Self { Decode!(bytes.as_ref(), Self).unwrap() }
    const BOUND: Bound = Bound::Unbounded;
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct ChunkData {
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

impl Storable for ChunkData {
    fn to_bytes(&self) -> Cow<[u8]> { Cow::Owned(Encode!(self).unwrap()) }
    fn from_bytes(bytes: Cow<[u8]>) -> Self { Decode!(bytes.as_ref(), Self).unwrap() }
    const BOUND: Bound = Bound::Unbounded; 
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, CandidType, Deserialize, Serialize)]
pub struct ChunkKey {
    pub consignment_id: ConsignmentId,
    pub chunk_index: ChunkIndex,
}

impl Storable for ChunkKey {
    fn to_bytes(&self) -> Cow<[u8]> { Cow::Owned(Encode!(self).unwrap()) }
    fn from_bytes(bytes: Cow<[u8]>) -> Self { Decode!(bytes.as_ref(), Self).unwrap() }
    const BOUND: Bound = Bound::Bounded { max_size: 20, is_fixed_size: false };
}

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, CandidType, Deserialize, Serialize)]
pub struct UserKey {
    pub user: Principal,
    pub consignment_id: ConsignmentId,
}

impl Storable for UserKey {
    fn to_bytes(&self) -> Cow<[u8]> { Cow::Owned(Encode!(self).unwrap()) }
    fn from_bytes(bytes: Cow<[u8]>) -> Self { Decode!(bytes.as_ref(), Self).unwrap() }
    const BOUND: Bound = Bound::Bounded { max_size: 50, is_fixed_size: false };
}

// --- MEMORY MANAGEMENT ---
thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static CONSIGNMENT_METADATA: RefCell<StableBTreeMap<ConsignmentId, ConsignmentMetadata, Memory>> = RefCell::new(
        StableBTreeMap::init(MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))))
    );

    static CONSIGNMENT_CHUNKS: RefCell<StableBTreeMap<ChunkKey, ChunkData, Memory>> = RefCell::new(
        StableBTreeMap::init(MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))))
    );

    static USER_INDEX: RefCell<StableBTreeMap<UserKey, (), Memory>> = RefCell::new(
        StableBTreeMap::init(MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(2))))
    );
    
    static NEXT_ID: RefCell<ConsignmentId> = RefCell::new(1);
}

// --- HELPERS ---
fn get_ecdsa_key_id() -> EcdsaKeyId {
    EcdsaKeyId { curve: EcdsaCurve::Secp256k1, name: KEY_NAME.to_string() }
}

async fn get_own_public_key() -> PublicKey {
    let caller_principal = caller();
    let (pk_response,) = ecdsa_public_key(EcdsaPublicKeyArgument {
        canister_id: None,
        derivation_path: vec![caller_principal.as_slice().to_vec()],
        key_id: get_ecdsa_key_id(),
    }).await.expect("Failed to fetch public key");
    PublicKey::from_slice(&pk_response.public_key).expect("Invalid public key")
}

async fn derive_address_for_principal(p: Principal) -> String {
    let (pk_response,) = ecdsa_public_key(EcdsaPublicKeyArgument {
        canister_id: None,
        derivation_path: vec![p.as_slice().to_vec()],
        key_id: get_ecdsa_key_id(),
    }).await.expect("Failed to fetch public key");
    let public_key = PublicKey::from_slice(&pk_response.public_key).expect("Invalid public key");
    Address::p2wpkh(&public_key, BITCOIN_NETWORK).expect("Failed to create address").to_string()
}

// --- STORAGE API ---
#[ic_cdk::update]
fn create_consignment(filename: String, total_chunks: u32, total_size: u64, content_type: String) -> ConsignmentId {
    let owner = caller();
    let id = NEXT_ID.with(|counter| {
        let current = *counter.borrow();
        *counter.borrow_mut() = current + 1;
        current
    });
    let metadata = ConsignmentMetadata { id, owner, filename, total_chunks, total_size, content_type, created_at: ic_cdk::api::time() };
    CONSIGNMENT_METADATA.with(|p| p.borrow_mut().insert(id, metadata));
    USER_INDEX.with(|p| p.borrow_mut().insert(UserKey { user: owner, consignment_id: id }, ()));
    id
}

#[ic_cdk::update]
fn upload_chunk(consignment_id: ConsignmentId, chunk_index: u32, data: Vec<u8>) -> Result<String, String> {
    let owner = caller();
    let is_owner = CONSIGNMENT_METADATA.with(|p| {
        p.borrow().get(&consignment_id).map_or(false, |meta| meta.owner == owner)
    });
    if !is_owner { return Err("Unauthorized or not found".into()); }
    CONSIGNMENT_CHUNKS.with(|p| p.borrow_mut().insert(ChunkKey { consignment_id, chunk_index }, ChunkData { data }));
    Ok(format!("Chunk {} uploaded", chunk_index))
}

#[ic_cdk::query]
fn get_consignment_metadata(id: ConsignmentId) -> Option<ConsignmentMetadata> {
    CONSIGNMENT_METADATA.with(|p| p.borrow().get(&id))
}

#[ic_cdk::query]
fn get_chunk(id: ConsignmentId, index: u32) -> Option<Vec<u8>> {
    CONSIGNMENT_CHUNKS.with(|p| p.borrow().get(&ChunkKey { consignment_id: id, chunk_index: index }).map(|c| c.data))
}

// --- BITCOIN API ---
#[ic_cdk::update]
async fn get_wallet_address() -> String {
    derive_address_for_principal(caller()).await
}

#[ic_cdk::update]
pub async fn get_btc_balance(address_opt: Option<String>) -> u64 {
    let target_address = match address_opt {
        Some(addr) => addr,
        None => derive_address_for_principal(caller()).await,
    };
    let (balance_sats,) = bitcoin_get_balance(GetBalanceRequest {
        address: target_address,
        network: ICP_BITCOIN_NETWORK,
        min_confirmations: None,
    }).await.expect("Failed to fetch balance");
    balance_sats
}

#[ic_cdk::update]
pub async fn get_estimated_bitcoin_fees() -> Vec<u64> {
    let (percentiles,) = bitcoin_get_current_fee_percentiles(GetCurrentFeePercentilesRequest {
        network: ICP_BITCOIN_NETWORK,
    }).await.expect("Failed to fetch fee percentiles");

    let base_rate = if percentiles.is_empty() { 2000 } else { percentiles[50] };
    let slow_rate = *percentiles.get(25).unwrap_or(&base_rate) / 1000;
    let avg_rate = *percentiles.get(50).unwrap_or(&base_rate) / 1000;
    let fast_rate = *percentiles.get(80).unwrap_or(&base_rate) / 1000;

    let v_size = 141; // Typical P2WPKH size
    vec![slow_rate * v_size, avg_rate * v_size, fast_rate * v_size]
}

#[ic_cdk::update]
pub async fn get_utxos(address: String) -> Vec<Utxo> {
    // Construct the request for the Bitcoin management canister
    let request = GetUtxosRequest {
        address,
        network: ICP_BITCOIN_NETWORK, // Use the constant defined in your code (e.g., Testnet)
        filter: None,                 // No filter results in returning the full UTXO set
    };

    // Make the inter-canister call to the Bitcoin management canister
    // This must be an 'update' call because it involves inter-canister communication
    let (response,) = bitcoin_get_utxos(request)
        .await
        .expect("Failed to fetch UTXOs from the Bitcoin management canister");

    response.utxos
}

#[ic_cdk::update]
async fn send_bitcoin(destination_address: String, amount_sats: u64) -> String {
    let caller_principal = caller();
    let dst_address = Address::from_str(&destination_address)
        .expect("Invalid destination address")
        .require_network(BITCOIN_NETWORK).expect("Network mismatch");

    let own_public_key = get_own_public_key().await;
    let own_address = Address::p2wpkh(&own_public_key, BITCOIN_NETWORK).expect("Invalid address");
    
    let fee_percentiles = bitcoin_get_current_fee_percentiles(GetCurrentFeePercentilesRequest {
        network: ICP_BITCOIN_NETWORK,
    }).await.expect("Failed fees").0;
    
    let fee_per_byte = if fee_percentiles.is_empty() { 2 } else { fee_percentiles[50] / 1000 };

    let utxos_res = bitcoin_get_utxos(GetUtxosRequest {
        network: ICP_BITCOIN_NETWORK,
        address: own_address.to_string(),
        filter: None,
    }).await.expect("Failed UTXOs").0;

    let mut selected_utxos = Vec::new();
    let mut selected_amount = 0;
    let estimated_size = 150; 
    let fee = estimated_size * fee_per_byte;
    let target_amount = amount_sats + fee;

    for utxo in utxos_res.utxos {
        selected_amount += utxo.value;
        selected_utxos.push(utxo);
        if selected_amount >= target_amount { break; }
    }

    if selected_amount < target_amount { ic_cdk::trap("Insufficient funds"); }

    let inputs = selected_utxos.iter().map(|utxo| TxIn {
        previous_output: OutPoint {
            txid: Txid::from_slice(&utxo.outpoint.txid).expect("Invalid Txid"),
            vout: utxo.outpoint.vout,
        },
        script_sig: ScriptBuf::new(),
        sequence: bitcoin::Sequence::MAX,
        witness: Witness::new(),
    }).collect();

    let mut outputs = vec![TxOut { value: amount_sats, script_pubkey: dst_address.script_pubkey() }];
    let change_amount = selected_amount - target_amount;
    if change_amount > 546 {
        outputs.push(TxOut { value: change_amount, script_pubkey: own_address.script_pubkey() });
    }

    let mut tx = Transaction { 
        version: 2, 
        lock_time: bitcoin::locktime::absolute::LockTime::ZERO, 
        input: inputs, 
        output: outputs 
    };

    // 1. Generate signatures
    let mut signatures = Vec::new();
    {
        // FIX: The cache itself MUST be declared as mutable
        let mut cache = SighashCache::new(&tx); 
        for (index, utxo) in selected_utxos.iter().enumerate() {
            let sighash = cache.segwit_signature_hash(
                index,
                &own_address.script_pubkey(), 
                utxo.value,
                EcdsaSighashType::All,
            ).expect("Sighash failed");

            let (sig_res,) = sign_with_ecdsa(SignWithEcdsaArgument {
                message_hash: sighash.to_byte_array().to_vec(),
                derivation_path: vec![caller_principal.as_slice().to_vec()],
                key_id: get_ecdsa_key_id(),
            }).await.expect("Sign failed");

            let mut der = sec1_to_der(sig_res.signature);
            der.push(EcdsaSighashType::All as u8);
            signatures.push(der);
        }
    } 

    // 2. Add witnesses
    for (index, input) in tx.input.iter_mut().enumerate() {
        let mut w = Witness::new();
        w.push(&signatures[index]);
        w.push(own_public_key.inner.serialize());
        input.witness = w;
    }

    // 3. Broadcast
    let mut tx_bytes = Vec::new();
    tx.consensus_encode(&mut tx_bytes).unwrap();
    bitcoin_send_transaction(SendTransactionRequest { 
        network: ICP_BITCOIN_NETWORK, 
        transaction: tx_bytes 
    }).await.expect("Send failed");

    tx.txid().to_string()
}

fn sec1_to_der(sec1: Vec<u8>) -> Vec<u8> {
    Signature::from_compact(&sec1).expect("Invalid sig").serialize_der().to_vec()
}

ic_cdk::export_candid!();