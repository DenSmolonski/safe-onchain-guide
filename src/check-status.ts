/**
 * Read-only: check who has approved a Safe transaction hash on-chain.
 * No gas cost — just RPC reads.
 *
 * Usage:
 *   npx tsx src/check-status.ts 0xSafeTxHash
 *   npx tsx src/check-status.ts                # reads from pending-tx.json
 */
import 'dotenv/config'
import fs from 'fs'
import { initProtocolKit, SAFE_ADDRESS } from './utils/config.js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

async function main() {
  let safeTxHash = process.argv[2]

  if (!safeTxHash) {
    if (fs.existsSync('pending-tx.json')) {
      const payload = JSON.parse(fs.readFileSync('pending-tx.json', 'utf8'))
      safeTxHash = payload.safeTxHash
      console.log('Read hash from pending-tx.json')
    } else {
      console.error('Usage: npx tsx src/check-status.ts <safeTxHash>')
      console.error('   or: have pending-tx.json in the current directory')
      process.exit(1)
    }
  }

  // Use either owner key — we're only reading, not sending transactions
  const signerKey = process.env.OWNER_1_PRIVATE_KEY || process.env.OWNER_2_PRIVATE_KEY
  if (!signerKey) throw new Error('Need OWNER_1_PRIVATE_KEY or OWNER_2_PRIVATE_KEY in .env (for SDK init, no tx sent)')

  const protocolKit = await initProtocolKit(signerKey)

  const owners = await protocolKit.getOwners()
  const threshold = await protocolKit.getThreshold()
  const nonce = await protocolKit.getNonce()
  const approvers = await protocolKit.getOwnersWhoApprovedTx(safeTxHash)

  console.log(`\nSafe: ${SAFE_ADDRESS}`)
  console.log(`Threshold: ${threshold}  |  Current nonce: ${nonce}`)
  console.log(`TX Hash: ${safeTxHash}`)
  console.log(`\nApprovals: ${approvers.length}/${threshold}`)

  owners.forEach((owner) => {
    const approved = approvers.map((a) => a.toLowerCase()).includes(owner.toLowerCase())
    console.log(`  ${approved ? '[x]' : '[ ]'} ${owner}`)
  })

  if (approvers.length >= threshold) {
    console.log('\nThreshold met — ready to execute.')
  } else {
    console.log(`\nWaiting for ${threshold - approvers.length} more approval(s).`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
