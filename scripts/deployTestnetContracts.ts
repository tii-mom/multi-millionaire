import 'dotenv/config';
import fs from 'fs';
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

function requiredAddress(...names: string[]): Address {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return Address.parse(value);
    }
  }
  throw new Error(`${names.join(' or ')} is required for testnet deployment`);
}

function optionalApiKey(): string | undefined {
  return process.env.TONCENTER_TESTNET_API_KEY?.trim() || undefined;
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
  const endpoint = process.env.CHAIN_RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC';
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to deploy: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const mnemonic = required('TESTNET_DEPLOYER_MNEMONIC').split(/\s+/);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const client = new TonClient({ endpoint, apiKey: optionalApiKey() });
  const openedWallet = client.open(wallet);
  const sender = openedWallet.sender(keyPair.secretKey);
  const seqno = await withToncenterRetry('get wallet seqno', () => openedWallet.getSeqno());
  const owner = wallet.address;
  const tokenAddress = Address.parse(process.env.TOKEN_ADDRESS_TESTNET || process.env.CHAIN_ADMIN_ADDRESS_TESTNET || owner.toString({ testOnly: true }));
  const vaultJettonWallet = requiredAddress('LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET', 'VAULT_JETTON_WALLET_ADDRESS_TESTNET');
  const rewardJettonWallet = requiredAddress('REWARD_JETTON_WALLET_ADDRESS_TESTNET');

  const lockVault = LockVault.fromInit(owner, tokenAddress, vaultJettonWallet);
  const merkleClaim = MerkleClaim.fromInit(owner, tokenAddress, rewardJettonWallet);
  const openedLockVault = client.open(await lockVault);
  const openedMerkleClaim = client.open(await merkleClaim);

  console.log(JSON.stringify({
    network: 'ton-testnet',
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

  const lockVaultState = await waitForDeploy(client, openedLockVault.address);
  const merkleClaimState = await waitForDeploy(client, openedMerkleClaim.address);

  const updates = {
    LOCK_VAULT_ADDRESS_TESTNET: openedLockVault.address.toString({ testOnly: true }),
    MERKLE_CLAIM_ADDRESS_TESTNET: openedMerkleClaim.address.toString({ testOnly: true }),
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
  console.error(error.message);
  process.exit(1);
});
