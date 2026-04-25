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

function optionalTestnetApiKey(): string | undefined {
  return process.env.TONCENTER_TESTNET_API_KEY?.trim() || undefined;
}

function redactSecrets(message: string): string {
  let redacted = message;
  for (const [name, value] of Object.entries(process.env)) {
    const secret = value?.trim();
    if (!secret || secret.length < 4 || !/(API_KEY|MNEMONIC|SECRET|PRIVATE|PASSWORD)/i.test(name)) {
      continue;
    }
    redacted = redacted.split(secret).join('[redacted]');
  }
  return redacted
    .replace(/([?&](?:api[_-]?key|token|key)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/((?:authorization|x-api-key|api-key|apikey)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[redacted]');
}

function formatError(error: unknown): string {
  const maybeError = error as { message?: unknown; response?: { status?: unknown } };
  const status = typeof maybeError?.response?.status === 'number' ? `HTTP ${maybeError.response.status}: ` : '';
  const rawMessage = typeof maybeError?.message === 'string' ? maybeError.message : String(error);
  const compactMessage = redactSecrets(rawMessage).replace(/\s+/g, ' ').trim() || 'Script failed';
  return `${status}${compactMessage.length > 500 ? `${compactMessage.slice(0, 497)}...` : compactMessage}`;
}

async function main() {
  const chainId = required('CHAIN_ID');
  if (chainId !== 'ton-testnet') {
    throw new Error(`Refusing to derive testnet wallets with CHAIN_ID=${chainId}`);
  }
  const endpoint = required('CHAIN_RPC_URL');
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to derive testnet wallets: CHAIN_RPC_URL is not a testnet endpoint');
  }
  const tokenDecimals = process.env.TOKEN_DECIMALS_TESTNET?.trim() || process.env.TOKEN_DECIMALS?.trim();
  if (tokenDecimals !== '9') {
    throw new Error('TOKEN_DECIMALS_TESTNET or TOKEN_DECIMALS must be 9 for the 72H token');
  }

  const tokenAddress = Address.parse(required('TOKEN_ADDRESS_TESTNET'));
  const lockVaultAddress = Address.parse(required('LOCK_VAULT_ADDRESS_TESTNET'));
  const merkleClaimAddress = Address.parse(required('MERKLE_CLAIM_ADDRESS_TESTNET'));
  const client = new TonClient({
    endpoint,
    apiKey: optionalTestnetApiKey(),
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
  console.error(formatError(error));
  process.exit(1);
});
