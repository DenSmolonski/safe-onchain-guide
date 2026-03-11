/**
 * Owner 1: Create a Safe transaction, sign it off-chain, and save
 * to a JSON file for the other owners to co-sign.
 *
 * Usage:
 *   npx tsx src/offchain-3owners/1-propose.ts
 *   npx tsx src/offchain-3owners/1-propose.ts --to 0x... --value 1000 --data 0x
 */
import 'dotenv/config'
import fs from 'fs'
import { OperationType } from '@safe-global/types-kit'
import { initProtocolKit, getOwnerKey, SAFE_ADDRESS, CHAIN_ID } from './utils/config.js'
import type { PendingTransaction } from './utils/signatures.js'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag)
    if (idx !== -1 && args[idx + 1]) return args[idx + 1]
    return fallback
  }

  return {
    to: get('--to', process.env.RECIPIENT_ADDRESS || ''),
    value: get('--value', process.env.SEND_VALUE_WEI || '0'),
    data: get('--data', '0x'),
  }
}

const PENDING_FILE = 'pending-offchain-tx.json'

async function main() {
  const { to, value, data } = parseArgs()
  if (!to) {
    console.error('Provide a recipient: --to 0x... or set RECIPIENT_ADDRESS in .env')
    process.exit(1)
  }

  const ownerKey = getOwnerKey(1)
  console.log('Initializing protocol-kit as Owner 1...')
  const protocolKit = await initProtocolKit(ownerKey)

  const owners = await protocolKit.getOwners()
  const threshold = await protocolKit.getThreshold()
  const nonce = await protocolKit.getNonce()
  console.log(`Safe: ${SAFE_ADDRESS}`)
  console.log(`Owners: ${owners.join(', ')}`)
  console.log(`Threshold: ${threshold}  |  Current nonce: ${nonce}`)

  // 1. Create the transaction
  console.log(`\nCreating tx: send ${value} wei to ${to}`)
  const safeTransaction = await protocolKit.createTransaction({
    transactions: [{
      to,
      value,
      data,
      operation: OperationType.Call,
    }],
  })

  // 2. Get the Safe tx hash
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)
  console.log(`Safe TX Hash: ${safeTxHash}`)

  // 3. Sign off-chain (no gas cost)
  console.log('\nSigning off-chain (EIP-712)...')
  const signedTx = await protocolKit.signTransaction(safeTransaction)

  // 4. Extract signature from the signed transaction
  const signerAddress = (await protocolKit.getSafeProvider().getSignerAddress())!
  const signature = signedTx.getSignature(signerAddress)
  if (!signature) throw new Error('Failed to extract signature after signing')

  // 5. Write JSON with 1 signature
  const pending: PendingTransaction = {
    safeAddress: SAFE_ADDRESS,
    chainId: CHAIN_ID,
    safeTxHash,
    threshold,
    safeTransactionData: safeTransaction.data,
    signatures: [
      { signer: signature.signer, data: signature.data },
    ],
  }
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2))
  console.log(`\nSaved: ${PENDING_FILE}`)

  console.log(`\nSignatures: 1/${threshold} — need ${threshold - 1} more`)
  console.log('Next: npx tsx src/offchain-3owners/2-sign.ts --owner 2')
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
