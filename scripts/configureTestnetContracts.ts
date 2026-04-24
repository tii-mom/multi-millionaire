import 'dotenv/config';
import { Address, TonClient, WalletContractV4, toNano } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import { MerkleClaim } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withToncenterRetry<T>(label: string, action: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await action();
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status;
      if (status !== 429) {
        throw error;
      }
      await sleep(2500 + attempt * 1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function main() {
  const endpoint = process.env.CHAIN_RPC_URL || process.env.RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC';
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to configure testnet contracts: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const mnemonic = required('TESTNET_DEPLOYER_MNEMONIC').split(/\s+/);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const client = new TonClient({
    endpoint,
    apiKey: optionalTestnetApiKey(),
  });
  const openedWallet = client.open(wallet);
  const sender = openedWallet.sender(keyPair.secretKey);
  const owner = wallet.address;
  const expectedOwner = process.env.CHAIN_ADMIN_ADDRESS_TESTNET?.trim()
    ? Address.parse(process.env.CHAIN_ADMIN_ADDRESS_TESTNET)
    : null;
  if (expectedOwner && !owner.equals(expectedOwner)) {
    throw new Error('TESTNET_DEPLOYER_MNEMONIC does not match CHAIN_ADMIN_ADDRESS_TESTNET');
  }

  const lockVaultAddress = Address.parse(required('LOCK_VAULT_ADDRESS_TESTNET'));
  const merkleClaimAddress = Address.parse(required('MERKLE_CLAIM_ADDRESS_TESTNET'));
  const vaultJettonWallet = Address.parse(required('LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET'));
  const rewardJettonWallet = Address.parse(required('REWARD_JETTON_WALLET_ADDRESS_TESTNET'));
  const priceUsdE6 = process.env.LOCK_VAULT_PRICE_USD_E6_TESTNET?.trim()
    ? BigInt(process.env.LOCK_VAULT_PRICE_USD_E6_TESTNET.trim())
    : null;
  const lockVault = client.open(LockVault.fromAddress(lockVaultAddress));
  const merkleClaim = client.open(MerkleClaim.fromAddress(merkleClaimAddress));

  console.log(JSON.stringify({
    network: 'ton-testnet',
    owner: owner.toString({ testOnly: true }),
    lockVaultAddress: lockVaultAddress.toString({ testOnly: true }),
    merkleClaimAddress: merkleClaimAddress.toString({ testOnly: true }),
    vaultJettonWallet: vaultJettonWallet.toString({ testOnly: true }),
    rewardJettonWallet: rewardJettonWallet.toString({ testOnly: true }),
    priceUsdE6: priceUsdE6 ? priceUsdE6.toString() : null,
  }, null, 2));

  await withToncenterRetry('set LockVault Jetton wallet', () => lockVault.send(
    sender,
    { value: toNano('0.05') },
    { $$type: 'SetVaultJettonWallet', queryId: BigInt(Date.now()), vaultJettonWallet },
  ));
  await sleep(4000);

  await withToncenterRetry('set MerkleClaim reward Jetton wallet', () => merkleClaim.send(
    sender,
    { value: toNano('0.05') },
    { $$type: 'SetRewardJettonWallet', queryId: BigInt(Date.now()), rewardJettonWallet },
  ));
  await sleep(4000);

  if (priceUsdE6 !== null) {
    if (priceUsdE6 < 0n) {
      throw new Error('LOCK_VAULT_PRICE_USD_E6_TESTNET must be non-negative');
    }
    await withToncenterRetry('set LockVault price', () => lockVault.send(
      sender,
      { value: toNano('0.05') },
      { $$type: 'SetPrice', queryId: BigInt(Date.now()), priceUsdE6 },
    ));
  }

  console.log(JSON.stringify({
    configured: true,
    followUp: 'Run sendTestnetDeposit.ts with TESTNET_CANARY_AMOUNT_RAW after the user Jetton wallet is funded.',
  }, null, 2));
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
