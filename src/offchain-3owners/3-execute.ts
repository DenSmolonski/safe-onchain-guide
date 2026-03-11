/**
 * Execute: Load pending transaction with all collected off-chain signatures
 * and submit a single on-chain transaction.
 *
 * Usage:
 *   npx tsx src/offchain-3owners/3-execute.ts             # defaults to Owner 1 as executor
 *   npx tsx src/offchain-3owners/3-execute.ts --owner 2   # use Owner 2's key for gas
 */
import 'dotenv/config'
import fs from 'fs'
import { OperationType } from '@safe-global/types-kit'
import { initProtocolKit, getOwnerKey } from './utils/config.js'
import { applySignatures } from './utils/signatures.js'
import type { PendingTransaction } from './utils/signatures.js'

function parseOwnerFlag(): number {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--owner')
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10)
  return 1
}

const PENDING_FILE = 'pending-offchain-tx.json'

async function main() {
  const ownerNum = parseOwnerFlag()

  if (!fs.existsSync(PENDING_FILE)) {
    throw new Error(`${PENDING_FILE} not found. Run propose + sign scripts first.`)
  }
  const pending: PendingTransaction = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'))
  console.log(`Loaded ${PENDING_FILE} (${pending.signatures.length}/${pending.threshold} signatures)`)

  // Check threshold
  if (pending.signatures.length < pending.threshold) {
    throw new Error(
      `Not enough signatures: ${pending.signatures.length}/${pending.threshold}. ` +
      `Collect ${pending.threshold - pending.signatures.length} more before executing.`,
    )
  }

  const ownerKey = getOwnerKey(ownerNum)
  console.log(`Initializing protocol-kit as Owner ${ownerNum} (executor)...`)
  const protocolKit = await initProtocolKit(ownerKey)

  // Recreate the exact same SafeTransaction
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

  // Verify hash
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)
  if (safeTxHash !== pending.safeTxHash) {
    throw new Error(
      `Hash mismatch!\n  Expected: ${pending.safeTxHash}\n  Got:      ${safeTxHash}\n` +
      `Transaction parameters differ — the pending file may be corrupted.`,
    )
  }
  console.log('Hash verified — matches stored transaction.')

  // Restore all off-chain signatures onto the transaction
  applySignatures(safeTransaction, pending.signatures)
  console.log(`Applied ${pending.signatures.length} off-chain signatures.`)

  // Execute — single on-chain transaction
  console.log('\nExecuting transaction on-chain...')
  const executeTxResponse = await protocolKit.executeTransaction(safeTransaction)
  console.log(`\nExecution TX: ${executeTxResponse.hash}`)
  const execReceipt = executeTxResponse.transactionResponse as { wait?: () => Promise<unknown> }
  await execReceipt?.wait?.()
  console.log('Transaction executed successfully!')
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
