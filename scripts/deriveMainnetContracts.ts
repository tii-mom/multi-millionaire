import 'dotenv/config';
import crypto from 'crypto';
import { Address } from '@ton/core';
import { JettonMaster, TonClient } from '@ton/ton';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import { MerkleClaim } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';

function required(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`${names.join(' or ')} is required`);
}

function optional(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function optionalToncenterApiKey(): string | undefined {
  return optional('TONCENTER_API_KEY');
}

function chainIdHash(chainId: string) {
  return BigInt(`0x${crypto.createHash('sha256').update(chainId).digest('hex')}`);
}

async function deriveJettonWallet(rpcUrl: string | undefined, token: Address, owner: Address) {
  if (!rpcUrl) return null;
  const client = new TonClient({ endpoint: rpcUrl, apiKey: optionalToncenterApiKey() });
  const jettonMaster = client.open(JettonMaster.create(token));
  return jettonMaster.getWalletAddress(owner);
}

async function maybeDeriveJettonWallet(rpcUrl: string | undefined, token: Address, owner: Address) {
  try {
    const address = await deriveJettonWallet(rpcUrl, token, owner);
    return { address: address?.toString() || null, error: null };
  } catch (error) {
    return {
      address: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const chainId = optional('CHAIN_ID') || 'ton-mainnet';
  if (chainId !== 'ton-mainnet') {
    throw new Error(`Refusing to derive mainnet contracts with CHAIN_ID=${chainId}`);
  }

  const owner = Address.parse(required('CHAIN_ADMIN_ADDRESS_MAINNET', 'CHAIN_ADMIN_ADDRESS'));
  const token = Address.parse(required('TOKEN_ADDRESS_MAINNET', 'TOKEN_ADDRESS'));
  const tokenDecimals = optional('TOKEN_DECIMALS_MAINNET', 'TOKEN_DECIMALS');
  if (tokenDecimals !== '9') {
    throw new Error('TOKEN_DECIMALS_MAINNET or TOKEN_DECIMALS must be 9 for the 72H token');
  }
  const lockVault = await LockVault.fromInit(owner, token);
  const merkleClaim = await MerkleClaim.fromInit(owner, token, chainIdHash(chainId));
  const rpcUrl = optional('CHAIN_RPC_URL', 'RPC_URL');
  const vaultJettonWallet = await maybeDeriveJettonWallet(rpcUrl, token, lockVault.address);
  const rewardJettonWallet = await maybeDeriveJettonWallet(rpcUrl, token, merkleClaim.address);

  console.log(JSON.stringify({
    chainId,
    chainIdHash: chainIdHash(chainId).toString(),
    owner: owner.toString(),
    tokenAddress: token.toString(),
    lockVaultAddress: lockVault.address.toString(),
    merkleClaimAddress: merkleClaim.address.toString(),
    lockVaultJettonWalletAddress: vaultJettonWallet.address,
    rewardJettonWalletAddress: rewardJettonWallet.address,
    jettonWalletDerivationErrors: [vaultJettonWallet.error, rewardJettonWallet.error].filter(Boolean),
    deployCommands: [
      'CHAIN_ID=ton-mainnet npm run contract:deploy:lock-vault:mainnet',
      'CHAIN_ID=ton-mainnet npm run contract:deploy:merkle-claim:mainnet',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
