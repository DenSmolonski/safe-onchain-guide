import 'dotenv/config'
import Safe from '@safe-global/protocol-kit'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}. Copy .env.example → .env and fill it in.`)
  return value
}

export const RPC_URL = requireEnv('RPC_URL')
export const CHAIN_ID = parseInt(requireEnv('CHAIN_ID'), 10)
export const SAFE_ADDRESS = requireEnv('SAFE_ADDRESS')

export async function initProtocolKit(privateKey: string): Promise<Safe> {
  return Safe.init({
    provider: RPC_URL,
    signer: privateKey,
    safeAddress: SAFE_ADDRESS,
  })
}
