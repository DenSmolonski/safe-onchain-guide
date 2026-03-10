/**
 * Owner 1: Create a Safe transaction, approve it on-chain, and output
 * a shareable URL + JSON file for Owner 2 to execute.
 *
 * Usage:
 *   npx tsx src/1-owner1-approve.ts
 *   npx tsx src/1-owner1-approve.ts --to 0x... --value 0.1 --data 0x
 */
import 'dotenv/config'
import fs from 'fs'
import { OperationType } from '@safe-global/types-kit'
import { initProtocolKit, SAFE_ADDRESS, CHAIN_ID } from './utils/config.js'
import { encodeProposalToURL } from './utils/url-codec.js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

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

async function main() {
  const { to, value, data } = parseArgs()
  if (!to) {
    console.error('Provide a recipient: --to 0x... or set RECIPIENT_ADDRESS in .env')
    process.exit(1)
  }

  const ownerKey = requireEnv('OWNER_1_PRIVATE_KEY')
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

  // 3. Approve on-chain (sends a real tx — costs gas)
  console.log('\nSending approveHash() on-chain...')
  const approveTxResponse = await protocolKit.approveTransactionHash(safeTxHash)
  console.log(`Approval TX: ${approveTxResponse.hash}`)
  const approvalReceipt = approveTxResponse.transactionResponse as { wait?: () => Promise<unknown> }
  await approvalReceipt?.wait?.()
  console.log('Approval confirmed on-chain.')

  // 4. Verify approval was stored
  const approvers = await protocolKit.getOwnersWhoApprovedTx(safeTxHash)
  console.log(`On-chain approvals: [${approvers.join(', ')}]`)

  // 5. Save JSON for Owner 2
  const payload = {
    safeAddress: SAFE_ADDRESS,
    chainId: CHAIN_ID,
    safeTxHash,
    safeTransactionData: safeTransaction.data,
  }
  fs.writeFileSync('pending-tx.json', JSON.stringify(payload, null, 2))
  console.log('\nSaved: pending-tx.json')

  // 6. Generate shareable URL
  const shareURL = encodeProposalToURL(
    'https://app.safe.global', // or your own frontend
    CHAIN_ID,
    SAFE_ADDRESS,
    safeTransaction,
  )
  console.log('\n--- Share with Owner 2 ---')
  console.log(`URL: ${shareURL}`)
  console.log(`JSON: pending-tx.json`)
  console.log('\nOwner 2 runs: npx tsx src/2-owner2-execute.ts')
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
