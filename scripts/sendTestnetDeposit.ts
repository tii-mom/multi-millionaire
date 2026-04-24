import 'dotenv/config';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { Address, beginCell, internal, SendMode, toNano } from '@ton/core';
import { JettonMaster, JettonWallet, TonClient, WalletContractV4 } from '@ton/ton';
import { parseLockVaultDepositBody, TonTransactionLike } from '../server/src/services/tonMessages';

const JETTON_TRANSFER_OPCODE = 0x0f8a7ea5;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalMnemonic(): string {
  const value = process.env.TESTNET_DEPOSITOR_MNEMONIC?.trim() || process.env.TESTNET_DEPLOYER_MNEMONIC?.trim();
  if (!value) {
    throw new Error('TESTNET_DEPOSITOR_MNEMONIC or TESTNET_DEPLOYER_MNEMONIC is required');
  }
  return value;
}

function readPositiveBigInt(name: string): bigint {
  const value = required(name);
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error('non-positive');
    }
    return parsed;
  } catch {
    throw new Error(`${name} must be a positive integer raw token amount`);
  }
}

function readPositiveInteger(name: string, fallback?: string): number {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSeqno(openedWallet: any, previousSeqno: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const nextSeqno = await openedWallet.getSeqno();
    if (nextSeqno > previousSeqno) {
      return nextSeqno;
    }
    await sleep(3000);
  }
  throw new Error('Timed out waiting for wallet seqno to advance');
}

async function fetchLockVaultTransactions(rpcUrl: string, address: Address): Promise<TonTransactionLike[]> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `deposit-canary-${Date.now()}`,
      method: 'getTransactions',
      params: {
        address: address.toString({ testOnly: true }),
        limit: 20,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`TON RPC returned HTTP ${response.status}`);
  }
  const payload: { ok?: boolean; result?: TonTransactionLike[]; error?: { message?: string } } = await response.json();
  if (!payload.ok || !Array.isArray(payload.result)) {
    throw new Error(payload.error?.message || 'TON RPC returned an invalid getTransactions response');
  }
  return payload.result;
}

async function findDepositTx(input: {
  rpcUrl: string;
  lockVaultAddress: Address;
  positionId: string;
  waveId: number;
  amountRaw: string;
  senderAddress: string;
}) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const transactions = await fetchLockVaultTransactions(input.rpcUrl, input.lockVaultAddress);
    for (const tx of transactions) {
      const message = tx.in_msg;
      if (!message?.body || !message.destination || !tx.transaction_id?.hash) {
        continue;
      }
      try {
        const deposit = parseLockVaultDepositBody(message.body);
        if (
          deposit.positionId === input.positionId &&
          deposit.waveId === input.waveId &&
          deposit.amountRaw === input.amountRaw &&
          deposit.senderAddress === input.senderAddress
        ) {
          return {
            txHash: tx.transaction_id.hash,
            lt: tx.transaction_id.lt || null,
            utime: tx.utime || null,
          };
        }
      } catch {
        // Ignore unrelated LockVault transactions while polling for this canary.
      }
    }
    await sleep(3000);
  }
  return null;
}

async function main() {
  const endpoint = process.env.CHAIN_RPC_URL || process.env.RPC_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC';
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to send deposit: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const tokenAddress = Address.parse(required('TOKEN_ADDRESS_TESTNET'));
  const lockVaultAddress = Address.parse(required('LOCK_VAULT_ADDRESS_TESTNET'));
  const amountRaw = readPositiveBigInt('TESTNET_CANARY_AMOUNT_RAW');
  const waveId = readPositiveInteger('TESTNET_CANARY_WAVE_ID', '1');
  const positionId = BigInt(process.env.TESTNET_CANARY_POSITION_ID?.trim() || Date.now().toString());
  if (positionId <= 0n) {
    throw new Error('TESTNET_CANARY_POSITION_ID must be a positive integer');
  }

  const mnemonic = optionalMnemonic().split(/\s+/);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const client = new TonClient({
    endpoint,
    apiKey: process.env.TONCENTER_TESTNET_API_KEY?.trim() || process.env.TONCENTER_API_KEY?.trim() || undefined,
  });
  const openedWallet = client.open(wallet);
  const senderAddress = wallet.address;
  const jettonMaster = client.open(JettonMaster.create(tokenAddress));
  const depositorJettonWalletAddress = await jettonMaster.getWalletAddress(senderAddress);
  const depositorJettonWallet = client.open(JettonWallet.create(depositorJettonWalletAddress));
  const balance = await depositorJettonWallet.getBalance();

  if (balance < amountRaw) {
    throw new Error(`Insufficient testnet Jetton balance. Required ${amountRaw.toString()}, available ${balance.toString()}`);
  }

  const queryId = BigInt(Date.now());
  const forwardPayload = beginCell()
    .storeUint(waveId, 32)
    .storeUint(positionId, 64)
    .endCell();
  const transferBody = beginCell()
    .storeUint(JETTON_TRANSFER_OPCODE, 32)
    .storeUint(queryId, 64)
    .storeCoins(amountRaw)
    .storeAddress(lockVaultAddress)
    .storeAddress(senderAddress)
    .storeBit(false)
    .storeCoins(toNano(process.env.TESTNET_CANARY_FORWARD_TON || '0.03'))
    .storeBit(true)
    .storeRef(forwardPayload)
    .endCell();

  const seqno = await openedWallet.getSeqno();
  await openedWallet.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [
      internal({
        to: depositorJettonWalletAddress,
        value: toNano(process.env.TESTNET_CANARY_TRANSFER_TON || '0.15'),
        bounce: true,
        body: transferBody,
      }),
    ],
  });
  const nextSeqno = await waitForSeqno(openedWallet, seqno);
  const receipt = await findDepositTx({
    rpcUrl: endpoint,
    lockVaultAddress,
    positionId: positionId.toString(),
    waveId,
    amountRaw: amountRaw.toString(),
    senderAddress: senderAddress.toRawString().toLowerCase(),
  });

  console.log(JSON.stringify({
    submitted: true,
    network: 'ton-testnet',
    tokenAddress: tokenAddress.toString({ testOnly: true }),
    lockVaultAddress: lockVaultAddress.toString({ testOnly: true }),
    depositorWallet: senderAddress.toString({ testOnly: true }),
    depositorJettonWallet: depositorJettonWalletAddress.toString({ testOnly: true }),
    amountRaw: amountRaw.toString(),
    waveId,
    positionId: positionId.toString(),
    walletSeqnoBefore: seqno,
    walletSeqnoAfter: nextSeqno,
    lockVaultReceipt: receipt,
    followUp: receipt
      ? 'Submit lockVaultReceipt.txHash to POST /v1/waves/:waveId/deposit-receipt.'
      : 'Wallet transfer was submitted, but the LockVault receipt was not found within the polling window.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
