import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { Address, JettonMaster, TonClient, WalletContractV4, toNano } from '@ton/ton';
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

function chainIdHash(chainId: string) {
  return BigInt(`0x${crypto.createHash('sha256').update(chainId).digest('hex')}`);
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

async function waitForDeploy(client: TonClient, address: Address) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await client.getContractState(address);
    if (state.state === 'active') {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Timed out waiting for ${address.toString({ testOnly: true })} deployment`);
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
  const chainId = required('CHAIN_ID');
  if (chainId !== 'ton-testnet') {
    throw new Error(`Refusing to deploy testnet contracts with CHAIN_ID=${chainId}`);
  }
  const endpoint = required('CHAIN_RPC_URL');
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to deploy: CHAIN_RPC_URL is not a testnet endpoint');
  }
  const tokenDecimals = process.env.TOKEN_DECIMALS_TESTNET?.trim() || process.env.TOKEN_DECIMALS?.trim();
  if (tokenDecimals !== '9') {
    throw new Error('TOKEN_DECIMALS_TESTNET or TOKEN_DECIMALS must be 9 for the 72H token');
  }

  const mnemonic = required('TESTNET_DEPLOYER_MNEMONIC').split(/\s+/);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const client = new TonClient({ endpoint, apiKey: optionalTestnetApiKey() });
  const openedWallet = client.open(wallet);
  const sender = openedWallet.sender(keyPair.secretKey);
  const seqno = await withToncenterRetry('get wallet seqno', () => openedWallet.getSeqno());
  const owner = wallet.address;
  const tokenAddress = Address.parse(required('TOKEN_ADDRESS_TESTNET'));

  const lockVault = LockVault.fromInit(owner, tokenAddress);
  const merkleClaim = MerkleClaim.fromInit(owner, tokenAddress, chainIdHash(chainId));
  const openedLockVault = client.open(await lockVault);
  const openedMerkleClaim = client.open(await merkleClaim);
  const jettonMaster = client.open(JettonMaster.create(tokenAddress));
  const vaultJettonWallet = await withToncenterRetry(
    'derive LockVault Jetton wallet',
    () => jettonMaster.getWalletAddress(openedLockVault.address)
  );
  const rewardJettonWallet = await withToncenterRetry(
    'derive MerkleClaim reward Jetton wallet',
    () => jettonMaster.getWalletAddress(openedMerkleClaim.address)
  );

  console.log(JSON.stringify({
    network: 'ton-testnet',
    chainId,
    chainIdHash: chainIdHash(chainId).toString(),
    endpoint,
    wallet: owner.toString({ testOnly: true }),
    tokenAddress: tokenAddress.toString({ testOnly: true }),
    vaultJettonWallet: vaultJettonWallet.toString({ testOnly: true }),
    rewardJettonWallet: rewardJettonWallet.toString({ testOnly: true }),
    seqno,
    lockVault: openedLockVault.address.toString({ testOnly: true }),
    merkleClaim: openedMerkleClaim.address.toString({ testOnly: true }),
  }, null, 2));

  await withToncenterRetry('deploy LockVault', () => openedLockVault.send(sender, { value: toNano('0.05') }, null));
  await sleep(4000);
  await withToncenterRetry('deploy MerkleClaim', () => openedMerkleClaim.send(sender, { value: toNano('0.05') }, null));
  await sleep(4000);

  await withToncenterRetry('set LockVault Jetton wallet', () => openedLockVault.send(
    sender,
    { value: toNano('0.05') },
    { $$type: 'SetVaultJettonWallet', queryId: BigInt(Date.now()), vaultJettonWallet },
  ));
  await sleep(4000);

  await withToncenterRetry('set MerkleClaim reward Jetton wallet', () => openedMerkleClaim.send(
    sender,
    { value: toNano('0.05') },
    { $$type: 'SetRewardJettonWallet', queryId: BigInt(Date.now()), rewardJettonWallet },
  ));
  await sleep(4000);

  const lockVaultState = await waitForDeploy(client, openedLockVault.address);
  const merkleClaimState = await waitForDeploy(client, openedMerkleClaim.address);

  const updates = {
    LOCK_VAULT_ADDRESS_TESTNET: openedLockVault.address.toString({ testOnly: true }),
    MERKLE_CLAIM_ADDRESS_TESTNET: openedMerkleClaim.address.toString({ testOnly: true }),
    LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET: vaultJettonWallet.toString({ testOnly: true }),
    REWARD_JETTON_WALLET_ADDRESS_TESTNET: rewardJettonWallet.toString({ testOnly: true }),
    LOCK_VAULT_DEPLOYMENT_LT_TESTNET: lockVaultState.lastTransaction?.lt.toString() || '',
    MERKLE_CLAIM_DEPLOYMENT_LT_TESTNET: merkleClaimState.lastTransaction?.lt.toString() || '',
  };

  if (process.env.UPDATE_ENV === 'true') {
    updateEnv(updates);
  }

  console.log(JSON.stringify({
    deployed: true,
    ...updates,
  }, null, 2));
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
