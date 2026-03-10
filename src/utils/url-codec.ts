import type { SafeTransaction } from '@safe-global/types-kit'

/**
 * Encode a Safe transaction into a shareable URL.
 *
 * URL format: {baseURL}/#/safe/{chainId}/{safeAddress}/execute?targets=...&calldatas=...&values=...
 * Pipe-delimited for multi-action (MultiSend) transactions.
 */
export function encodeProposalToURL(
  baseURL: string,
  chainId: number,
  safeAddress: string,
  safeTransaction: SafeTransaction,
): string {
  const d = safeTransaction.data

  const params = new URLSearchParams({
    targets: d.to,
    calldatas: d.data,
    values: d.value,
    nonce: String(d.nonce),
    operation: String(d.operation),
    safeTxGas: d.safeTxGas.toString(),
    baseGas: d.baseGas.toString(),
    gasPrice: d.gasPrice.toString(),
    gasToken: d.gasToken,
    refundReceiver: d.refundReceiver,
  })

  return `${baseURL}/#/safe/${chainId}/${safeAddress}/execute?${params.toString()}`
}

/** Decoded proposal ready for createTransaction(). */
export interface DecodedProposal {
  chainId: number
  safeAddress: string
  actions: { to: string; data: string; value: string; operation: number }[]
  options: {
    nonce: number
    safeTxGas: string
    baseGas: string
    gasPrice: string
    gasToken: string
    refundReceiver: string
  }
}

/**
 * Decode a proposal URL back into transaction parameters.
 *
 * Supports both single-action and pipe-delimited multi-action URLs.
 */
export function decodeProposalFromURL(url: string): DecodedProposal {
  const parsed = new URL(url)
  const params = new URLSearchParams(parsed.hash.split('?')[1] || '')

  // Extract path segments: /#/safe/{chainId}/{safeAddress}/execute
  const hashPath = parsed.hash.replace('#/', '').split('?')[0]
  const segments = hashPath.split('/')
  // segments: ["safe", chainId, safeAddress, "execute"]
  const chainId = parseInt(segments[1], 10)
  const safeAddress = segments[2]

  const targets = (params.get('targets') || '').split('|')
  const calldatas = (params.get('calldatas') || '').split('|')
  const values = (params.get('values') || '').split('|')
  const operation = parseInt(params.get('operation') || '0', 10)
  const nonce = parseInt(params.get('nonce') || '0', 10)

  const actions = targets.map((to, i) => ({
    to,
    data: calldatas[i] || '0x',
    value: values[i] || '0',
    operation,
  }))

  return {
    chainId,
    safeAddress,
    actions,
    options: {
      nonce,
      safeTxGas: params.get('safeTxGas') || '0',
      baseGas: params.get('baseGas') || '0',
      gasPrice: params.get('gasPrice') || '0',
      gasToken: params.get('gasToken') || '0x0000000000000000000000000000000000000000',
      refundReceiver: params.get('refundReceiver') || '0x0000000000000000000000000000000000000000',
    },
  }
}
