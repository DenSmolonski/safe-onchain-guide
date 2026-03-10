# Safe 2-of-2 Multisig: On-Chain `approveHash` Flow

Fully on-chain coordination for a 2-of-2 Safe multisig. No backend, no off-chain signatures, no Safe Transaction Service. The chain IS the signature store.

## How It Works

```
Owner 1                                    Owner 2
───────                                    ───────
createTransaction()
       │
getTransactionHash(tx) → safeTxHash
       │
approveTransactionHash(safeTxHash)
  → on-chain tx: Safe.approveHash(hash)
  → approvedHashes[owner1][hash] = 1
       │
share tx params (JSON/URL)  ───────────→  receive tx params
  (to, value, data, nonce)                      │
  NO signatures needed!                   createTransaction()  ← recreate identical tx
                                                │
                                          getTransactionHash(tx) → verify same hash
                                                │
                                          executeTransaction(tx)
                                            → Safe contract checks:
                                              approvedHashes[owner1][hash] ✓
                                              msg.sender == owner2 ✓
                                            → executes the tx on-chain
```

**Two on-chain transactions total:**
1. Owner 1 calls `approveHash()` (~65k gas)
2. Owner 2 calls `execTransaction()` (~100k+ gas)

On L2s (Base, Optimism, Arbitrum): ~$0.001–$0.01 per tx.

## Quick Start

### Prerequisites

- Node.js 18+
- A 2-of-2 Safe deployed on your target chain
- Both owner private keys (or run each script from its respective machine)

### Setup

```bash
cp .env.example .env
# Edit .env with your RPC URL, Safe address, and owner keys
npm install
```

### Run the Flow

**Terminal 1 — Owner 1 approves:**
```bash
npx tsx src/1-owner1-approve.ts
# or with custom params:
npx tsx src/1-owner1-approve.ts --to 0xRecipient --value 100000000000000000 --data 0x
```

Output:
```
Safe TX Hash: 0xabc123...
Approval TX: 0xdef456...
Approval confirmed on-chain.

--- Share with Owner 2 ---
URL: https://app.safe.global/#/safe/84532/0xYourSafe/execute?targets=...
JSON: pending-tx.json
```

**Terminal 2 — Owner 2 executes:**
```bash
# From JSON file (default):
npx tsx src/2-owner2-execute.ts

# From URL:
npx tsx src/2-owner2-execute.ts "https://app.safe.global/#/safe/84532/0xYourSafe/execute?targets=..."

# Approve-only (don't execute yet):
npx tsx src/2-owner2-execute.ts --approve-only
```

**Check status (read-only, no gas):**
```bash
npx tsx src/check-status.ts 0xSafeTxHash
# or just:
npx tsx src/check-status.ts  # reads hash from pending-tx.json
```

## Sharing Transaction Parameters

Owner 1 needs to send transaction parameters to Owner 2. **No signatures** are shared — they live on-chain. Only the tx data fields that both owners need to reconstruct the identical `SafeTransaction`.

### Option A: JSON File

The `1-owner1-approve.ts` script saves `pending-tx.json` automatically. Send it via Slack, email, or any channel. It contains:

```json
{
  "safeAddress": "0xYourSafe",
  "chainId": 84532,
  "safeTxHash": "0xabc123...",
  "safeTransactionData": {
    "to": "0xRecipient",
    "value": "100000000000000000",
    "data": "0x",
    "operation": 0,
    "safeTxGas": "0",
    "baseGas": "0",
    "gasPrice": "0",
    "gasToken": "0x0000000000000000000000000000000000000000",
    "refundReceiver": "0x0000000000000000000000000000000000000000",
    "nonce": 0
  }
}
```

### Option B: URL

The script also prints a shareable URL that encodes all tx parameters in query string format (pipe-delimited for multi-action). Owner 2 passes the URL as argument.

## File Structure

```
├── package.json
├── tsconfig.json
├── .env.example           # Template — copy to .env
├── .gitignore
└── src/
    ├── 1-owner1-approve.ts   # Owner 1: create → approve on-chain → share
    ├── 2-owner2-execute.ts   # Owner 2: verify hash → execute
    ├── check-status.ts       # Read-only: who approved?
    └── utils/
        ├── config.ts          # .env loader + initProtocolKit()
        └── url-codec.ts       # Encode/decode tx params ↔ URL
```

## What Happens On-Chain

### After Owner 1 approves:
```
Safe contract storage:
  approvedHashes[0xOwner1][0xSafeTxHash] = 1
```

### When Owner 2 calls executeTransaction():
1. protocol-kit reads `approvedHashes[owner1][hash] == 1` from the contract
2. Constructs the signatures array:
   - Owner 1: type `0x01` (pre-validated via `approveHash`)
   - Owner 2: type `0x00` (ECDSA, signed by `msg.sender` at execution time)
3. Calls `Safe.execTransaction(to, value, data, ..., signatures)`
4. Safe contract validates both signatures → threshold met → executes

## Safety Notes

1. **All `safeTransactionData` fields must be identical** between Owner 1 and Owner 2. Any difference changes the hash and the approval won't match.

2. **Nonce must match the Safe's current nonce.** If another tx executes first and increments the nonce, recreate with the new nonce.

3. **`approveHash` is permanent.** Once written on-chain, it cannot be revoked. To "cancel," execute a different tx with the same nonce.

4. **`executeTransaction()` auto-collects on-chain approvals.** The protocol-kit reads `approvedHashes` and constructs the signature array automatically.

## Gas Costs (2-of-2)

| Step | Who | On-Chain TX | Gas |
|------|-----|-------------|-----|
| Owner 1 approves | Owner 1 | `Safe.approveHash(hash)` | ~65k |
| Owner 2 executes | Owner 2 | `Safe.execTransaction(...)` | ~100k+ |
| **Total** | | **2 on-chain txs** | **~165k+** |

## Testing on Base Sepolia

1. Deploy a 2-of-2 Safe via [app.safe.global](https://app.safe.global) on Base Sepolia (chain ID: 84532)
2. Fund the Safe with some test ETH from a [faucet](https://www.alchemy.com/faucets/base-sepolia)
3. Fund both owner wallets with test ETH for gas
4. Fill in `.env` and run the flow above
5. Verify on [Base Sepolia Basescan](https://sepolia.basescan.org/) that both txs succeeded

## Demo: Base Sepolia (real execution)

Real run on Base Sepolia (chain 84532), 2-of-2 Safe at [`0xF3F7...`](https://sepolia.basescan.org/address/0xF3F751f639E02Ad0B3458828FD9cBB093BB6A806).

**Owner 1 approves:**
```
$ npx tsx src/1-owner1-approve.ts
Initializing protocol-kit as Owner 1...
Safe: 0xF3F751f639E02Ad0B3458828FD9cBB093BB6A806
Owners: 0x3B747C372C2088963ABc2194B7D5ADe238965b33, 0x179Cba17F8936e7A910Aee9D356a1DB7ca0591f3
Threshold: 2  |  Current nonce: 0

Creating tx: send 900000000000000 wei to 0x3B747C372C2088963ABc2194B7D5ADe238965b33
Safe TX Hash: 0x62cb07e7e9dac4bbd880ce7058edb44a887476641362384884665ada68ecb8e0

Sending approveHash() on-chain...
Approval TX: 0x97bc514928daf1800823d1cd24c6900884d7a2e52fd8b35ab01605a939fd0825
Approval confirmed on-chain.
On-chain approvals: []

Saved: pending-tx.json

--- Share with Owner 2 ---
URL: https://app.safe.global/#/safe/84532/0xF3F7.../execute?targets=...
JSON: pending-tx.json

Owner 2 runs: npx tsx src/2-owner2-execute.ts
```

**Owner 2 executes:**
```
$ npx tsx src/2-owner2-execute.ts
Loading from pending-tx.json...
Safe: 0xF3F751f639E02Ad0B3458828FD9cBB093BB6A806
Initializing protocol-kit as Owner 2...
Computed hash: 0x62cb07e7e9dac4bbd880ce7058edb44a887476641362384884665ada68ecb8e0
Hash verified — matches pending-tx.json.

Approvals: 1/2
  approved: 0x3B747C372C2088963ABc2194B7D5ADe238965b33

Executing transaction...
  protocol-kit will auto-collect on-chain approvals +
  use Owner 2 as msg.sender (counts as 2nd approval)

Execution TX: 0x191920834b282b91fceed8d2e5b3894dab2bd071ab916226bc4d97b0afe0e7da
Transaction executed successfully!
```

**On-chain transactions:**
- [approveHash() — Owner 1](https://sepolia.basescan.org/tx/0x97bc514928daf1800823d1cd24c6900884d7a2e52fd8b35ab01605a939fd0825)
- [execTransaction() — Owner 2](https://sepolia.basescan.org/tx/0x191920834b282b91fceed8d2e5b3894dab2bd071ab916226bc4d97b0afe0e7da)

## Dependencies

- [`@safe-global/protocol-kit`](https://github.com/safe-global/safe-core-sdk) — Safe SDK for transaction building, hashing, approval, execution
- [`@safe-global/types-kit`](https://github.com/safe-global/safe-core-sdk) — TypeScript types
- [`dotenv`](https://github.com/motdotla/dotenv) — Environment variable loading
- [`tsx`](https://github.com/privatenumber/tsx) — Run TypeScript directly (dev only)
