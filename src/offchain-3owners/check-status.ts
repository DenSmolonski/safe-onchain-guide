/**
 * Read-only: show collected off-chain signatures vs threshold.
 * No gas cost — reads from JSON file and RPC.
 *
 * Usage:
 *   npx tsx src/offchain-3owners/check-status.ts
 */
import 'dotenv/config'
import fs from 'fs'
import { initProtocolKit, getOwnerKey, SAFE_ADDRESS } from './utils/config.js'
import type { PendingTransaction } from './utils/signatures.js'

const PENDING_FILE = 'pending-offchain-tx.json'

async function main() {
  // Use any available owner key (read-only)
  const signerKey = process.env.OWNER_1_PRIVATE_KEY
    || process.env.OWNER_2_PRIVATE_KEY
    || process.env.OWNER_3_PRIVATE_KEY
  if (!signerKey) throw new Error('Need at least one OWNER_N_PRIVATE_KEY in .env (for SDK init, no tx sent)')

  const protocolKit = await initProtocolKit(signerKey)

  const owners = await protocolKit.getOwners()
  const threshold = await protocolKit.getThreshold()
  const nonce = await protocolKit.getNonce()

  console.log(`Safe: ${SAFE_ADDRESS}`)
  console.log(`Owners: ${owners.length}  |  Threshold: ${threshold}  |  Current nonce: ${nonce}`)

  if (!fs.existsSync(PENDING_FILE)) {
    console.log(`\nNo ${PENDING_FILE} found — nothing pending.`)
    return
  }

  const pending: PendingTransaction = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'))
  console.log(`\nPending TX Hash: ${pending.safeTxHash}`)

  // Warn if nonce is stale
  if (pending.safeTransactionData.nonce < nonce) {
    console.log(`\nWARNING: Stored nonce (${pending.safeTransactionData.nonce}) < current Safe nonce (${nonce}).`)
    console.log('This transaction is stale and will fail if executed.')
  }

  const signedAddrs = pending.signatures.map((s) => s.signer.toLowerCase())

  console.log(`\nSignatures: ${pending.signatures.length}/${pending.threshold}`)
  owners.forEach((owner) => {
    const signed = signedAddrs.includes(owner.toLowerCase())
    console.log(`  ${signed ? '[x]' : '[ ]'} ${owner}`)
  })

  if (pending.signatures.length >= pending.threshold) {
    console.log('\nThreshold met — ready to execute.')
    console.log('Run: npx tsx src/offchain-3owners/3-execute.ts')
  } else {
    console.log(`\nWaiting for ${pending.threshold - pending.signatures.length} more signature(s).`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
