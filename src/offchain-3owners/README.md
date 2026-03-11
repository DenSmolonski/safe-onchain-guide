# Safe 3-of-3 Multisig: Off-Chain Signature Collection

Off-chain EIP-712 signature coordination for a 3-of-3 Safe multisig. Signatures are collected in a JSON file — only **1 on-chain transaction** (execution) is needed instead of N approval txs.

## How It Works

```
Owner 1 (propose)              Owner 2 (sign)              Owner 3 (sign)
─────────────────              ──────────────              ──────────────
createTransaction()
getTransactionHash(tx)
signTransaction(tx)
  → off-chain EIP-712 sig
  → write JSON (1/3 sigs)
       │
       └─── share JSON ──→  load JSON
                             verify hash
                             signTransaction(tx)
                               → off-chain sig
                               → update JSON (2/3 sigs)
                                    │
                                    └─── share JSON ──→  load JSON
                                                         verify hash
                                                         signTransaction(tx)
                                                           → off-chain sig
                                                           → update JSON (3/3 sigs)

                        Any owner (execute)
                        ───────────────────
                        load JSON (3/3 sigs)
                        recreate tx + restore all signatures
                        executeTransaction(tx)
                          → single on-chain tx
                          → Safe validates 3 EIP-712 sigs
                          → executes
```

**One on-chain transaction total** (~100k+ gas for execution).
Compare with the on-chain `approveHash` flow which requires N-1 approval txs + 1 execution tx.

## Quick Start

### Prerequisites

- Node.js 18+
- A 3-of-3 Safe deployed on your target chain
- Three owner private keys (or run each script from its respective machine)

### Setup

```bash
cp .env.example .env
# Edit .env with your RPC URL, Safe address, and all 3 owner keys
npm install
```

### Run the Flow

**Step 1 — Owner 1 proposes and signs:**
```bash
npm run offchain:propose
# or with custom params:
npm run offchain:propose -- --to 0xRecipient --value 100000000000000000 --data 0x
```

Output:
```
Safe TX Hash: 0xabc123...
Signing off-chain (EIP-712)...
Saved: pending-offchain-tx.json

Signatures: 1/3 — need 2 more
```

**Step 2 — Owner 2 signs:**
```bash
npm run offchain:sign
# defaults to --owner 2
```

**Step 3 — Owner 3 signs:**
```bash
npm run offchain:sign -- --owner 3
```

**Step 4 — Any owner executes:**
```bash
npm run offchain:execute
# defaults to --owner 1 for gas; use --owner N to pick the executor
```

**Check status (read-only, no gas):**
```bash
npm run offchain:status
```

Output:
```
Safe: 0xYourSafe
Owners: 3  |  Threshold: 3  |  Current nonce: 0

Pending TX Hash: 0xabc123...

Signatures: 2/3
  [x] 0xOwner1
  [x] 0xOwner2
  [ ] 0xOwner3

Waiting for 1 more signature(s).
```

## Sharing the JSON File

Owner 1 creates `pending-offchain-tx.json` and shares it with the other owners. Each signer loads it, adds their off-chain signature, and writes it back. Send it via Slack, email, git, USB stick — whatever works. It contains:

```json
{
  "safeAddress": "0x339A...2853",
  "chainId": 84532,
  "safeTxHash": "0xbfc67e06...",
  "threshold": 3,
  "safeTransactionData": {
    "to": "0x179Cba17...",
    "value": "10000000000000",
    "data": "0x",
    "operation": 0,
    "baseGas": "0",
    "gasPrice": "0",
    "gasToken": "0x0000000000000000000000000000000000000000",
    "refundReceiver": "0x0000000000000000000000000000000000000000",
    "nonce": 1,
    "safeTxGas": "0"
  },
  "signatures": [
    { "signer": "0x1Bbc...", "data": "0x4fb306f1...1c" },
    { "signer": "0x3B74...", "data": "0x6bd77f57...1c" },
    { "signer": "0x179C...", "data": "0x8dddb70d...1c" }
  ]
}
```

No private keys are in the file — only public addresses and ECDSA signatures over the EIP-712 typed data hash.

## File Structure

```
src/offchain-3owners/
├── 1-propose.ts          # Owner 1: create tx + sign off-chain + save JSON
├── 2-sign.ts             # Owner 2/3: load JSON + sign off-chain + update JSON
├── 3-execute.ts          # Any owner: load JSON with 3 sigs + execute on-chain
├── check-status.ts       # Read-only: show collected signatures vs threshold
├── README.md
└── utils/
    ├── config.ts         # .env loader + getOwnerKey(n) + initProtocolKit()
    └── signatures.ts     # Serialize/deserialize signatures, duplicate check
```

## What Happens On-Chain

### At execution time (single tx):

1. The executor calls `Safe.execTransaction(to, value, data, ..., signatures)`
2. `signatures` contains all 3 EIP-712 signatures concatenated and sorted by signer address
3. The Safe contract recovers each signer via `ecrecover` and checks they are owners
4. Threshold (3) is met → transaction executes

No `approveHash()` calls needed. The signatures are passed directly in the `execTransaction` calldata.

## Off-Chain vs On-Chain: Comparison

| | On-chain `approveHash` (2-of-2) | Off-chain signatures (3-of-3) |
|---|---|---|
| Approval txs | N-1 on-chain txs | 0 (all off-chain) |
| Execution tx | 1 on-chain tx | 1 on-chain tx |
| **Total on-chain txs** | **N** | **1** |
| Gas cost | ~65k per approval + ~100k exec | ~100k+ exec only |
| Coordination | Share tx params (JSON/URL) | Share JSON file with signatures |
| Privacy | Approvals visible on-chain before execution | Only execution is visible on-chain |

## Safety Notes

1. **Hash verification is mandatory.** Every signer and the executor verify that the recreated transaction hash matches the stored one. Any parameter mismatch is caught before signing or executing.

2. **Duplicate signing is detected.** If an owner tries to sign twice, the script skips them with a message.

3. **Nonce must match the Safe's current nonce.** The status checker warns if the stored nonce is stale (another tx executed in the meantime).

4. **Signatures are not private keys.** The JSON file contains ECDSA signatures over a specific transaction hash — they cannot be used to sign anything else.

5. **Threshold is enforced.** The execute script refuses to submit if fewer signatures than the threshold are collected.

## Gas Costs (3-of-3)

| Step | Who | On-Chain TX | Gas |
|------|-----|-------------|-----|
| Owner 1 signs | Owner 1 | none (off-chain) | 0 |
| Owner 2 signs | Owner 2 | none (off-chain) | 0 |
| Owner 3 signs | Owner 3 | none (off-chain) | 0 |
| Execute | Any owner | `Safe.execTransaction(...)` | ~100k+ |
| **Total** | | **1 on-chain tx** | **~100k+** |

## Demo: Base Sepolia (real execution)

Real run on Base Sepolia (chain 84532), 3-of-3 Safe at [`0x339A...`](https://sepolia.basescan.org/address/0x339A137b7344D420AbF6aE0902BA483c220c2853).

**Step 1 — Owner 1 proposes and signs off-chain:**
```
$ npm run offchain:propose

Initializing protocol-kit as Owner 1...
Safe: 0x339A137b7344D420AbF6aE0902BA483c220c2853
Owners: 0x179Cba17F8936e7A910Aee9D356a1DB7ca0591f3, 0x3B747C372C2088963ABc2194B7D5ADe238965b33, 0x1Bbc3cfFe302b96E458127a52E297760c4b46310
Threshold: 3  |  Current nonce: 1

Creating tx: send 10000000000000 wei to 0x179Cba17F8936e7A910Aee9D356a1DB7ca0591f3
Safe TX Hash: 0xbfc67e06fa5eac30aea877f09bfdb59930ce755bdaac63c1adc159f8f3100b2a

Signing off-chain (EIP-712)...

Saved: pending-offchain-tx.json

Signatures: 1/3 — need 2 more
Next: npx tsx src/offchain-3owners/2-sign.ts --owner 2
```

**Step 2 — Owner 2 signs off-chain:**
```
$ npm run offchain:sign -- --owner 2

Loaded pending-offchain-tx.json (1/3 signatures)
Initializing protocol-kit as Owner 2...
Hash verified — matches stored transaction.

Signing off-chain as Owner 2...

Signatures: 2/3
Need 1 more signature(s).
Next: npx tsx src/offchain-3owners/2-sign.ts --owner <N>
```

**Execute too early — rejected (2/3 < threshold):**
```
$ npx tsx src/offchain-3owners/3-execute.ts --owner 3

Loaded pending-offchain-tx.json (2/3 signatures)
Error: Not enough signatures: 2/3. Collect 1 more before executing.
```

**Step 3 — Owner 3 signs off-chain:**
```
$ npm run offchain:sign -- --owner 3

Loaded pending-offchain-tx.json (2/3 signatures)
Initializing protocol-kit as Owner 3...
Hash verified — matches stored transaction.

Signing off-chain as Owner 3...

Signatures: 3/3
Threshold met! Ready to execute.
Next: npx tsx src/offchain-3owners/3-execute.ts
```

**Step 4 — Execute (single on-chain tx with all 3 off-chain sigs):**
```
$ npx tsx src/offchain-3owners/3-execute.ts --owner 3

Loaded pending-offchain-tx.json (3/3 signatures)
Initializing protocol-kit as Owner 3 (executor)...
Hash verified — matches stored transaction.
Applied 3 off-chain signatures.

Executing transaction on-chain...

Execution TX: 0x03af65ccb93eea37be6f0a82cd1df619eb5c6df7fe5a40072aca09aa2418aa44
Transaction executed successfully!
```

**On-chain transaction:**
- [execTransaction() — Owner 3](https://sepolia.basescan.org/tx/0x03af65ccb93eea37be6f0a82cd1df619eb5c6df7fe5a40072aca09aa2418aa44)

**The JSON file after all 3 signatures:**
```json
{
  "safeAddress": "0x339A137b7344D420AbF6aE0902BA483c220c2853",
  "chainId": 84532,
  "safeTxHash": "0xbfc67e06fa5eac30aea877f09bfdb59930ce755bdaac63c1adc159f8f3100b2a",
  "threshold": 3,
  "safeTransactionData": {
    "to": "0x179Cba17F8936e7A910Aee9D356a1DB7ca0591f3",
    "value": "10000000000000",
    "data": "0x",
    "operation": 0,
    "baseGas": "0",
    "gasPrice": "0",
    "gasToken": "0x0000000000000000000000000000000000000000",
    "refundReceiver": "0x0000000000000000000000000000000000000000",
    "nonce": 1,
    "safeTxGas": "0"
  },
  "signatures": [
    {
      "signer": "0x1Bbc3cfFe302b96E458127a52E297760c4b46310",
      "data": "0x4fb306f124e38280907b358d21315f0e7a35b7f78eae53cb1273d21652288bd82d80d6551290273fff80c30bf9004ed24269b66b10528204635ed6f1f8e187731c"
    },
    {
      "signer": "0x3B747C372C2088963ABc2194B7D5ADe238965b33",
      "data": "0x6bd77f5747b186198f73a9f9ab965eb6332f9578902c86cd78fac613478b1f5032617cf239ee75e941f2513c0eafffdfb15ebdeec6fd1ba106b76b0a2ded72141c"
    },
    {
      "signer": "0x179Cba17F8936e7A910Aee9D356a1DB7ca0591f3",
      "data": "0x8dddb70d91cdc4b08a7b0efb854784127e1d4880e59bd0e5c08023d7acb136c936a329add52b6e3fa5dcd770a7145d7bf23308500c3ff44e3c1e553fff0640e41c"
    }
  ]
}
```

## Testing on Base Sepolia

1. Deploy a Safe with N owners via [app.safe.global](https://app.safe.global) on Base Sepolia (chain ID: 84532)
2. Fund the Safe with some test ETH from a [faucet](https://www.alchemy.com/faucets/base-sepolia)
3. Fund at least one owner wallet with test ETH (only the executor needs gas)
4. Fill in `.env` with all owner keys and run the flow above
5. Verify on [Base Sepolia Basescan](https://sepolia.basescan.org/) that a single execution tx succeeded

## Edge Cases

- **Duplicate signing**: script detects and skips with a message (see demo above)
- **Insufficient signatures**: execute script errors with a clear count
- **Stale nonce**: status checker warns if stored nonce < current Safe nonce
- **Hash mismatch**: sign and execute scripts refuse to proceed if the recreated hash differs
- **Insufficient funds**: executor wallet needs ETH for gas + tx value
