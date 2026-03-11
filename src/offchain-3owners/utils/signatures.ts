import { EthSafeSignature } from '@safe-global/protocol-kit'
import type { SafeTransaction } from '@safe-global/types-kit'

export interface SerializedSignature {
  signer: string
  data: string
}

export interface PendingTransaction {
  safeAddress: string
  chainId: number
  safeTxHash: string
  threshold: number
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
  signatures: SerializedSignature[]
}

export function applySignatures(tx: SafeTransaction, signatures: SerializedSignature[]): void {
  for (const sig of signatures) {
    tx.addSignature(new EthSafeSignature(sig.signer, sig.data))
  }
}

export function isDuplicateSigner(address: string, signatures: SerializedSignature[]): boolean {
  return signatures.some((s) => s.signer.toLowerCase() === address.toLowerCase())
}
