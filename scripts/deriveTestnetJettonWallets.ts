import 'dotenv/config';
import fs from 'fs';
import { Address } from '@ton/core';
import { JettonMaster, TonClient } from '@ton/ton';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function updateEnv(updates: Record<string, string>) {
  const path = '.env';
  let text = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) {
      text = text.replace(re, line);
    } else {
      text += `${text.endsWith('\n') || text.length === 0 ? '' : '\n'}${line}\n`;
    }
  }
  fs.writeFileSync(path, text);
}

async function main() {
  const endpoint = process.env.CHAIN_RPC_URL || process.env.RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC';
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to derive testnet wallets: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const tokenAddress = Address.parse(required('TOKEN_ADDRESS_TESTNET'));
  const lockVaultAddress = Address.parse(required('LOCK_VAULT_ADDRESS_TESTNET'));
  const merkleClaimAddress = Address.parse(required('MERKLE_CLAIM_ADDRESS_TESTNET'));
  const client = new TonClient({
    endpoint,
    apiKey: process.env.TONCENTER_TESTNET_API_KEY?.trim() || process.env.TONCENTER_API_KEY?.trim() || undefined,
  });
  const jettonMaster = client.open(JettonMaster.create(tokenAddress));

  const vaultJettonWallet = await jettonMaster.getWalletAddress(lockVaultAddress);
  const rewardJettonWallet = await jettonMaster.getWalletAddress(merkleClaimAddress);
  const updates = {
    LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET: vaultJettonWallet.toString({ testOnly: true }),
    REWARD_JETTON_WALLET_ADDRESS_TESTNET: rewardJettonWallet.toString({ testOnly: true }),
  };

  if (process.env.UPDATE_ENV === 'true') {
    updateEnv(updates);
  }

  console.log(JSON.stringify({
    network: 'ton-testnet',
    tokenAddress: tokenAddress.toString({ testOnly: true }),
    lockVaultAddress: lockVaultAddress.toString({ testOnly: true }),
    merkleClaimAddress: merkleClaimAddress.toString({ testOnly: true }),
    ...updates,
    updatedEnv: process.env.UPDATE_ENV === 'true',
    followUp: 'Run configureTestnetContracts.ts after these addresses are in .env.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
