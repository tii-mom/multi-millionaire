import 'dotenv/config';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { Address, beginCell, internal, SendMode, toNano } from '@ton/core';
import { JettonMaster, JettonWallet, TonClient, WalletContractV4 } from '@ton/ton';
import * as tonMessages from '../server/src/services/tonMessages';
import type { TonTransactionLike } from '../server/src/services/tonMessages';

const JETTON_TRANSFER_OPCODE = 0x0f8a7ea5;
const tonMessageExports = ('default' in tonMessages ? tonMessages.default : tonMessages) as typeof tonMessages;
const { parseLockVaultDepositBody } = tonMessageExports;

function getMessageBody(message: TonTransactionLike['in_msg']): string | null {
  return message?.body || message?.msg_data?.body || null;
}

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
      const body = getMessageBody(message);
      if (!message || !body || !message.destination || !tx.transaction_id?.hash) {
        continue;
      }
      try {
        const deposit = parseLockVaultDepositBody(body);
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

function derivePositionId(owner: Address, queryId: bigint) {
  return BigInt(`0x${beginCell().storeAddress(owner).storeUint(queryId, 64).endCell().hash().toString('hex')}`).toString();
}

async function main() {
  const chainId = required('CHAIN_ID');
  if (chainId !== 'ton-testnet') {
    throw new Error(`Refusing to send testnet deposit with CHAIN_ID=${chainId}`);
  }
  const endpoint = required('CHAIN_RPC_URL');
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to send deposit: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const tokenAddress = Address.parse(required('TOKEN_ADDRESS_TESTNET'));
  const lockVaultAddress = Address.parse(required('LOCK_VAULT_ADDRESS_TESTNET'));
  const amountRaw = readPositiveBigInt('TESTNET_CANARY_AMOUNT_RAW');
  const waveId = readPositiveInteger('TESTNET_CANARY_WAVE_ID', '1');

  const mnemonic = optionalMnemonic().split(/\s+/);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const client = new TonClient({
    endpoint,
    apiKey: optionalTestnetApiKey(),
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
  const positionId = derivePositionId(senderAddress, queryId);
  const forwardPayload = beginCell()
    .storeUint(waveId, 32)
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
    positionId,
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
    queryId: queryId.toString(),
    positionId,
    walletSeqnoBefore: seqno,
    walletSeqnoAfter: nextSeqno,
    lockVaultReceipt: receipt,
    followUp: receipt
      ? 'Submit lockVaultReceipt.txHash to POST /v1/waves/:waveId/deposit-receipt.'
      : 'Wallet transfer was submitted, but the LockVault receipt was not found within the polling window.',
  }, null, 2));
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
