/**
 * Owner 2 or 3: Load pending transaction, sign off-chain, and update
 * the JSON file with the new signature.
 *
 * Usage:
 *   npx tsx src/offchain-3owners/2-sign.ts             # defaults to Owner 2
 *   npx tsx src/offchain-3owners/2-sign.ts --owner 3   # use Owner 3's key
 */
import 'dotenv/config'
import fs from 'fs'
import { OperationType } from '@safe-global/types-kit'
import { initProtocolKit, getOwnerKey } from './utils/config.js'
import { isDuplicateSigner } from './utils/signatures.js'
import type { PendingTransaction } from './utils/signatures.js'

function parseOwnerFlag(): number {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--owner')
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10)
  return 2
}

const PENDING_FILE = 'pending-offchain-tx.json'

async function main() {
  const ownerNum = parseOwnerFlag()

  if (!fs.existsSync(PENDING_FILE)) {
    throw new Error(`${PENDING_FILE} not found. Run 1-propose.ts first.`)
  }
  const pending: PendingTransaction = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'))
  console.log(`Loaded ${PENDING_FILE} (${pending.signatures.length}/${pending.threshold} signatures)`)

  const ownerKey = getOwnerKey(ownerNum)
  console.log(`Initializing protocol-kit as Owner ${ownerNum}...`)
  const protocolKit = await initProtocolKit(ownerKey)

  // Recreate the exact same SafeTransaction from stored data
  const d = pending.safeTransactionData
  const safeTransaction = await protocolKit.createTransaction({
    transactions: [{
      to: d.to,
      value: d.value,
      data: d.data,
      operation: d.operation as OperationType,
    }],
    options: {
      nonce: d.nonce,
      safeTxGas: d.safeTxGas,
      baseGas: d.baseGas,
      gasPrice: d.gasPrice,
      gasToken: d.gasToken,
      refundReceiver: d.refundReceiver,
    },
  })

  // Verify hash matches
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)
  if (safeTxHash !== pending.safeTxHash) {
    throw new Error(
      `Hash mismatch!\n  Expected: ${pending.safeTxHash}\n  Got:      ${safeTxHash}\n` +
      `Transaction parameters differ — check nonce, gas fields, and addresses.`,
    )
  }
  console.log('Hash verified — matches stored transaction.')

  // Duplicate check
  const signerAddress = (await protocolKit.getSafeProvider().getSignerAddress())!
  if (isDuplicateSigner(signerAddress, pending.signatures)) {
    console.log(`\nOwner ${ownerNum} (${signerAddress}) has already signed. Skipping.`)
    return
  }

  // Sign off-chain
  console.log(`\nSigning off-chain as Owner ${ownerNum}...`)
  const signedTx = await protocolKit.signTransaction(safeTransaction)

  const signature = signedTx.getSignature(signerAddress)
  if (!signature) throw new Error('Failed to extract signature after signing')

  // Append signature and write
  pending.signatures.push({ signer: signature.signer, data: signature.data })
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2))

  const count = pending.signatures.length
  console.log(`\nSignatures: ${count}/${pending.threshold}`)
  if (count >= pending.threshold) {
    console.log('Threshold met! Ready to execute.')
    console.log('Next: npx tsx src/offchain-3owners/3-execute.ts')
  } else {
    console.log(`Need ${pending.threshold - count} more signature(s).`)
    console.log(`Next: npx tsx src/offchain-3owners/2-sign.ts --owner <N>`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
