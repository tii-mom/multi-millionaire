import 'dotenv/config';
import { Address, TonClient, WalletContractV4, toNano } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { LockVault } from '../build/LockVault/LockVault_LockVault';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalApiKey(): string | undefined {
  return process.env.TONCENTER_TESTNET_API_KEY?.trim() || undefined;
}

function parsePositiveBigInt(name: string, fallback?: string): bigint {
  const raw = process.env[name]?.trim() || fallback;
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer string`);
  }
  const value = BigInt(raw);
  if (value <= 0n) {
    throw new Error(`${name} must be greater than zero`);
  }
  return value;
}

function parsePositiveNumber(name: string, fallback: string): number {
  const raw = process.env[name]?.trim() || fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a safe positive integer`);
  }
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSeqno(openedWallet: ReturnType<TonClient['open']>, previousSeqno: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const seqno = await (openedWallet as any).getSeqno();
    if (seqno > previousSeqno) {
      return seqno;
    }
    await sleep(3000);
  }
  throw new Error('Timed out waiting for wallet seqno to advance');
}

async function waitForVaultTransaction(client: TonClient, vaultAddress: Address, afterLt?: bigint) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const transactions = await client.getTransactions(vaultAddress, { limit: 10 });
    const match = transactions.find((tx) => {
      const lt = BigInt(tx.lt.toString());
      return afterLt === undefined || lt > afterLt;
    });
    if (match) {
      return match;
    }
    await sleep(3000);
  }
  throw new Error('Timed out waiting for LockVault transaction');
}

async function main() {
  const endpoint = process.env.CHAIN_RPC_URL || 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to send deposit: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const mnemonic = required('TESTNET_DEPLOYER_MNEMONIC').split(/\s+/);
  const lockVaultAddress = Address.parse(required('LOCK_VAULT_ADDRESS_TESTNET'));
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const client = new TonClient({ endpoint, apiKey: optionalApiKey() });
  const openedWallet = client.open(wallet);
  const openedVault = client.open(LockVault.fromAddress(lockVaultAddress));
  const sender = openedWallet.sender(keyPair.secretKey);
  const seqno = await openedWallet.getSeqno();
  const stateBefore = await client.getContractState(lockVaultAddress);
  const afterLt = stateBefore.lastTransaction?.lt ? BigInt(stateBefore.lastTransaction.lt.toString()) : undefined;

  const waveId = parsePositiveNumber('CANARY_WAVE_ID', '1');
  const amountRaw = parsePositiveBigInt('CANARY_AMOUNT_RAW', '1');
  const positionId = parsePositiveBigInt('CANARY_POSITION_ID', Date.now().toString());
  const queryId = parsePositiveBigInt('CANARY_QUERY_ID', Date.now().toString());
  const valueTon = process.env.CANARY_MESSAGE_VALUE_TON || '0.03';

  await openedVault.send(
    sender,
    { value: toNano(valueTon) },
    {
      $$type: 'Deposit',
      queryId,
      waveId: BigInt(waveId),
      amountRaw,
      positionId,
    },
  );

  await waitForSeqno(openedWallet, seqno);
  const transaction = await waitForVaultTransaction(client, lockVaultAddress, afterLt);
  const txHashBase64 = transaction.hash().toString('base64');

  console.log(JSON.stringify({
    network: 'ton-testnet',
    endpoint,
    wallet: wallet.address.toString({ testOnly: true }),
    lockVault: lockVaultAddress.toString({ testOnly: true }),
    waveId,
    amountRaw: amountRaw.toString(),
    positionId: positionId.toString(),
    queryId: queryId.toString(),
    txHash: txHashBase64,
    lt: transaction.lt.toString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
