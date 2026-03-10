/**
 * Owner 2: Load pending transaction (from JSON file or URL arg),
 * verify the hash, check on-chain approvals, and execute.
 *
 * Usage:
 *   npx tsx src/2-owner2-execute.ts                           # reads pending-tx.json
 *   npx tsx src/2-owner2-execute.ts "https://...#/safe/..."   # decodes from URL
 *   npx tsx src/2-owner2-execute.ts --approve-only            # approve without executing
 */
import 'dotenv/config'
import fs from 'fs'
import { initProtocolKit, SAFE_ADDRESS } from './utils/config.js'
import { decodeProposalFromURL } from './utils/url-codec.js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

interface TxPayload {
  safeAddress: string
  safeTxHash: string
  safeTransactionData: {
    to: string
    value: string
    data: string
    operation: number
    nonce: number
    safeTxGas: string
    baseGas: string
    gasPrice: string
    gasToken: string
    refundReceiver: string
  }
}

function loadFromJSON(): TxPayload {
  if (!fs.existsSync('pending-tx.json')) {
    throw new Error('pending-tx.json not found. Run owner1 script first or pass a URL argument.')
  }
  return JSON.parse(fs.readFileSync('pending-tx.json', 'utf8'))
}

function loadFromURL(url: string) {
  const decoded = decodeProposalFromURL(url)
  return {
    safeAddress: decoded.safeAddress,
    actions: decoded.actions,
    options: decoded.options,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const approveOnly = args.includes('--approve-only')
  const urlArg = args.find((a: string) => a.startsWith('http'))

  const ownerKey = requireEnv('OWNER_2_PRIVATE_KEY')

  let safeAddress: string
  let actions: { to: string; data: string; value: string; operation: number }[]
  let options: Record<string, any>
  let expectedHash: string | undefined

  if (urlArg) {
    // Decode from URL
    console.log('Decoding transaction from URL...')
    const decoded = loadFromURL(urlArg)
    safeAddress = decoded.safeAddress
    actions = decoded.actions
    options = decoded.options
  } else {
    // Load from JSON file
    console.log('Loading from pending-tx.json...')
    const payload = loadFromJSON()
    safeAddress = payload.safeAddress
    expectedHash = payload.safeTxHash
    const d = payload.safeTransactionData
    actions = [{
      to: d.to,
      value: d.value,
      data: d.data,
      operation: d.operation,
    }]
    options = {
      nonce: d.nonce,
      safeTxGas: d.safeTxGas,
      baseGas: d.baseGas,
      gasPrice: d.gasPrice,
      gasToken: d.gasToken,
      refundReceiver: d.refundReceiver,
    }
  }

  // Override SAFE_ADDRESS if the payload specifies one
  const targetSafe = safeAddress || SAFE_ADDRESS
  console.log(`Safe: ${targetSafe}`)

  console.log('Initializing protocol-kit as Owner 2...')
  const protocolKit = await initProtocolKit(ownerKey)

  // Recreate the EXACT same SafeTransaction
  const safeTransaction = await protocolKit.createTransaction({
    transactions: actions,
    options,
  })

  // Verify hash
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)
  console.log(`Computed hash: ${safeTxHash}`)

  if (expectedHash && safeTxHash !== expectedHash) {
    throw new Error(
      `Hash mismatch!\n  Expected: ${expectedHash}\n  Got:      ${safeTxHash}\n` +
      `Transaction parameters differ — check nonce, gas fields, and addresses.`,
    )
  }
  if (expectedHash) {
    console.log('Hash verified — matches pending-tx.json.')
  }

  // Check on-chain approvals
  const approvers = await protocolKit.getOwnersWhoApprovedTx(safeTxHash)
  const threshold = await protocolKit.getThreshold()
  console.log(`\nApprovals: ${approvers.length}/${threshold}`)
  approvers.forEach((addr) => console.log(`  approved: ${addr}`))

  if (approvers.length === 0) {
    throw new Error('No on-chain approvals found. Owner 1 has not approved yet.')
  }

  if (approveOnly) {
    // Just approve, don't execute
    console.log('\nSending approveHash() on-chain (--approve-only)...')
    const approveTxResponse = await protocolKit.approveTransactionHash(safeTxHash)
    console.log(`Approval TX: ${approveTxResponse.hash}`)
    const approveReceipt = approveTxResponse.transactionResponse as { wait?: () => Promise<unknown> }
    await approveReceipt?.wait?.()
    console.log('Approval confirmed.')
    return
  }

  // Execute — Owner 2 as msg.sender counts as the second approval
  console.log('\nExecuting transaction...')
  console.log('  protocol-kit will auto-collect on-chain approvals +')
  console.log('  use Owner 2 as msg.sender (counts as 2nd approval)')
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
