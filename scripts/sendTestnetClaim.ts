import 'dotenv/config';
import crypto from 'crypto';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { MerkleClaim, type ClaimState } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';
import { TestJettonMaster } from '../build/TestJetton/TestJetton_TestJettonMaster';
import { TestJettonWallet } from '../build/TestJetton/TestJetton_TestJettonWallet';

const MERKLE_CLAIM_OPCODE = 0x434c414d;
const DEFAULT_AMOUNT_RAW = '1000';
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 3000;

interface TonTransactionMessage {
  source?: string;
  destination?: string;
  body?: string;
  msg_data?: {
    body?: string;
  };
}

interface TonTransactionLike {
  transaction_id?: {
    lt?: string;
    hash?: string;
  };
  utime?: number;
  in_msg?: TonTransactionMessage;
  description?: {
    aborted?: boolean;
    compute_ph?: {
      success?: boolean;
      exit_code?: number;
    };
    action?: {
      success?: boolean;
      result_code?: number;
    };
  };
}

interface ParsedClaimReward {
  queryId: string;
  batchId: string;
  ledgerIdHash: string;
  recipient: string;
  amountRaw: string;
}

interface WalletIdentity {
  address: Address;
  wallet: WalletContractV4;
  secretKey: Buffer;
}

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

function readPositiveBigInt(name: string, fallback?: string): bigint {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error('non-positive');
    }
    return parsed;
  } catch {
    throw new Error(`${name} must be a positive integer`);
  }
}

function readUint64(name: string, fallback: string): bigint {
  const value = readPositiveBigInt(name, fallback);
  const maxUint64 = (1n << 64n) - 1n;
  if (value > maxUint64) {
    throw new Error(`${name} must fit uint64`);
  }
  return value;
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

function normalizeAddress(address: Address | string): string {
  return (typeof address === 'string' ? Address.parse(address) : address).toRawString().toLowerCase();
}

function addressToTestnetString(address: Address): string {
  return address.toString({ testOnly: true });
}

function hashLedgerId(ledgerId: string): bigint {
  return BigInt(`0x${crypto.createHash('sha256').update(ledgerId).digest('hex')}`);
}

function uint256Hex(value: bigint): string {
  return `0x${value.toString(16).padStart(64, '0')}`;
}

function cellHashInt(cell: Cell): bigint {
  return BigInt(`0x${cell.hash().toString('hex')}`);
}

function buildLeafHash(batchId: bigint, ledgerIdHash: bigint, recipient: Address, amountRaw: bigint): bigint {
  return cellHashInt(beginCell()
    .storeUint(batchId, 64)
    .storeUint(ledgerIdHash, 256)
    .storeAddress(recipient)
    .storeCoins(amountRaw)
    .endCell());
}

function emptyProof(): Cell {
  return beginCell().endCell();
}

async function walletFromMnemonic(mnemonicValue: string): Promise<WalletIdentity> {
  const keyPair = await mnemonicToPrivateKey(mnemonicValue.split(/\s+/));
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  return {
    address: wallet.address,
    wallet,
    secretKey: keyPair.secretKey,
  };
}

function getMessageBody(message: TonTransactionMessage | undefined): string | null {
  return message?.body || message?.msg_data?.body || null;
}

function transactionSucceeded(transaction: TonTransactionLike): boolean {
  const description = transaction.description;
  if (!description) {
    return true;
  }
  if (description.aborted === true) {
    return false;
  }
  if (description.compute_ph?.success === false) {
    return false;
  }
  if (description.action?.success === false) {
    return false;
  }
  return true;
}

function parseClaimRewardBody(bodyBase64: string): ParsedClaimReward {
  const slice = Cell.fromBase64(bodyBase64).beginParse();
  const opcode = slice.loadUint(32);
  if (opcode !== MERKLE_CLAIM_OPCODE) {
    throw new Error('Unexpected inbound opcode');
  }
  const queryId = slice.loadUintBig(64).toString();
  const batchId = slice.loadUintBig(64).toString();
  const ledgerIdHash = slice.loadUintBig(256).toString();
  const recipient = normalizeAddress(slice.loadAddress());
  const amountRaw = slice.loadCoins().toString();
  if (slice.remainingRefs < 1) {
    throw new Error('ClaimReward proof ref is missing');
  }
  return {
    queryId,
    batchId,
    ledgerIdHash,
    recipient,
    amountRaw,
  };
}

async function fetchMerkleClaimTransactions(rpcUrl: string, merkleClaimAddress: Address): Promise<TonTransactionLike[]> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const apiKey = optionalTestnetApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `claim-canary-${Date.now()}`,
      method: 'getTransactions',
      params: {
        address: addressToTestnetString(merkleClaimAddress),
        limit: Number(process.env.TESTNET_CLAIM_LOOKBACK_LIMIT || 20),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`TON RPC returned HTTP ${response.status}`);
  }
  const payload: { ok?: boolean; result?: unknown; error?: { message?: string } } = await response.json();
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }
  if (!Array.isArray(payload.result)) {
    throw new Error('TON RPC returned an invalid getTransactions response');
  }
  if (payload.ok === false) {
    throw new Error('TON RPC getTransactions request failed');
  }
  return payload.result as TonTransactionLike[];
}

function findClaimReceipt(input: {
  transactions: TonTransactionLike[];
  merkleClaimAddress: Address;
  claimantAddress: Address;
  queryId: bigint;
  batchId: bigint;
  ledgerIdHash: bigint;
  amountRaw: bigint;
}) {
  const expectedDestination = normalizeAddress(input.merkleClaimAddress);
  const expectedSource = normalizeAddress(input.claimantAddress);
  const expectedRecipient = expectedSource;

  for (const transaction of input.transactions) {
    const hash = transaction.transaction_id?.hash;
    const message = transaction.in_msg;
    const body = getMessageBody(message);
    if (!hash || !message?.source || !message.destination || !body) {
      continue;
    }
    if (normalizeAddress(message.destination) !== expectedDestination) {
      continue;
    }
    if (normalizeAddress(message.source) !== expectedSource) {
      continue;
    }
    if (!transactionSucceeded(transaction)) {
      continue;
    }
    try {
      const claim = parseClaimRewardBody(body);
      if (
        claim.queryId === input.queryId.toString()
        && claim.batchId === input.batchId.toString()
        && claim.ledgerIdHash === input.ledgerIdHash.toString()
        && claim.recipient === expectedRecipient
        && claim.amountRaw === input.amountRaw.toString()
      ) {
        return {
          txHash: hash,
          lt: transaction.transaction_id?.lt || null,
          utime: transaction.utime || null,
        };
      }
    } catch {
      // Ignore unrelated MerkleClaim inbound messages while polling this canary.
    }
  }
  return null;
}

async function pollClaimReceipt(input: {
  rpcUrl: string;
  merkleClaimAddress: Address;
  claimantAddress: Address;
  queryId: bigint;
  batchId: bigint;
  ledgerIdHash: bigint;
  amountRaw: bigint;
}) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const transactions = await fetchMerkleClaimTransactions(input.rpcUrl, input.merkleClaimAddress);
    const receipt = findClaimReceipt({ ...input, transactions });
    if (receipt) {
      return receipt;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function getRewardWalletBalance(client: TonClient, rewardJettonWalletAddress: Address): Promise<bigint> {
  const state = await withToncenterRetry('get reward Jetton wallet state', () => client.getContractState(rewardJettonWalletAddress));
  if (state.state !== 'active') {
    return 0n;
  }
  try {
    const wallet = client.open(TestJettonWallet.fromAddress(rewardJettonWalletAddress));
    const data = await withToncenterRetry('get reward Jetton wallet data', () => wallet.getGetWalletData());
    return data.balance;
  } catch (error) {
    throw new Error(`Unable to read reward Jetton wallet balance: ${formatError(error)}`);
  }
}

async function waitForRewardWalletBalance(input: {
  client: TonClient;
  rewardJettonWalletAddress: Address;
  minimumBalance: bigint;
}) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const balance = await getRewardWalletBalance(input.client, input.rewardJettonWalletAddress);
    if (balance >= input.minimumBalance) {
      return balance;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for reward Jetton wallet balance >= ${input.minimumBalance.toString()}`);
}

async function waitForMerkleRoot(input: {
  merkleClaim: { getClaimState(): Promise<ClaimState> };
  batchId: bigint;
  merkleRoot: bigint;
}) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const state = await withToncenterRetry('get MerkleClaim state', () => input.merkleClaim.getClaimState());
    if (state.activeBatchId === input.batchId && state.merkleRoot === input.merkleRoot) {
      return state;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for MerkleClaim root update');
}

async function waitForRewardWalletConfig(input: {
  merkleClaim: { getClaimState(): Promise<ClaimState> };
  rewardJettonWalletAddress: Address;
}) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const state = await withToncenterRetry('get MerkleClaim state', () => input.merkleClaim.getClaimState());
    if (state.rewardJettonWallet?.equals(input.rewardJettonWalletAddress)) {
      return state;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for MerkleClaim reward Jetton wallet update');
}

async function main() {
  const endpoint = required('CHAIN_RPC_URL');
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to send claim: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const tokenAddress = Address.parse(required('TOKEN_ADDRESS_TESTNET'));
  const merkleClaimAddress = Address.parse(required('MERKLE_CLAIM_ADDRESS_TESTNET'));
  const rewardJettonWalletAddress = Address.parse(required('REWARD_JETTON_WALLET_ADDRESS_TESTNET'));
  const ownerMnemonic = required('TESTNET_DEPLOYER_MNEMONIC');
  const claimantMnemonic = process.env.TESTNET_CLAIMANT_MNEMONIC?.trim() || ownerMnemonic;
  const owner = await walletFromMnemonic(ownerMnemonic);
  const claimant = await walletFromMnemonic(claimantMnemonic);
  const amountRaw = readPositiveBigInt('TESTNET_CLAIM_AMOUNT_RAW', DEFAULT_AMOUNT_RAW);
  const batchId = readUint64('TESTNET_CLAIM_BATCH_ID', Date.now().toString());
  const ledgerId = process.env.TESTNET_CLAIM_LEDGER_ID?.trim() || `testnet-canary-${Date.now()}`;
  const ledgerIdHash = hashLedgerId(ledgerId);
  const proof = emptyProof();
  const proofBoc = proof.toBoc().toString('base64');
  const merkleRoot = buildLeafHash(batchId, ledgerIdHash, claimant.address, amountRaw);

  const client = new TonClient({ endpoint, apiKey: optionalTestnetApiKey() });
  const ownerSender = client.open(owner.wallet).sender(owner.secretKey);
  const claimantSender = client.open(claimant.wallet).sender(claimant.secretKey);
  const merkleClaim = client.open(MerkleClaim.fromAddress(merkleClaimAddress));
  const testJetton = client.open(TestJettonMaster.fromAddress(tokenAddress));

  const derivedRewardWallet = await withToncenterRetry(
    'derive reward Jetton wallet',
    () => testJetton.getGetWalletAddress(merkleClaimAddress),
  );
  if (!derivedRewardWallet.equals(rewardJettonWalletAddress)) {
    throw new Error('REWARD_JETTON_WALLET_ADDRESS_TESTNET does not match TestJettonMaster wallet for MerkleClaim');
  }

  const claimState = await withToncenterRetry('get MerkleClaim state', () => merkleClaim.getClaimState());
  if (!claimState.owner.equals(owner.address)) {
    throw new Error('TESTNET_DEPLOYER_MNEMONIC does not match MerkleClaim owner');
  }
  if (!claimState.tokenAddress.equals(tokenAddress)) {
    throw new Error('TOKEN_ADDRESS_TESTNET does not match MerkleClaim tokenAddress');
  }
  if (claimState.paused) {
    throw new Error('MerkleClaim is paused');
  }
  if (!claimState.rewardJettonWallet || !claimState.rewardJettonWallet.equals(rewardJettonWalletAddress)) {
    if (claimState.claimCount !== 0n) {
      throw new Error('MerkleClaim reward Jetton wallet differs from REWARD_JETTON_WALLET_ADDRESS_TESTNET and claimCount is non-zero');
    }
    await withToncenterRetry('set MerkleClaim reward Jetton wallet', () => merkleClaim.send(
      ownerSender,
      { value: toNano('0.05') },
      { $$type: 'SetRewardJettonWallet', queryId: BigInt(Date.now()), rewardJettonWallet: rewardJettonWalletAddress },
    ));
    await waitForRewardWalletConfig({ merkleClaim, rewardJettonWalletAddress });
  }

  const existingBalance = await getRewardWalletBalance(client, rewardJettonWalletAddress);
  let finalRewardWalletBalance = existingBalance;
  if (existingBalance < amountRaw) {
    const jettonOwner = await withToncenterRetry('get TestJettonMaster owner', () => testJetton.getOwner());
    if (!jettonOwner.equals(owner.address)) {
      throw new Error('TESTNET_DEPLOYER_MNEMONIC does not match TestJettonMaster owner; cannot mint test Jettons');
    }
    const mintAmount = amountRaw - existingBalance;
    await withToncenterRetry('mint test Jettons to MerkleClaim', () => testJetton.send(
      ownerSender,
      { value: toNano('0.12') },
      {
        $$type: 'Mint',
        queryId: BigInt(Date.now()),
        recipient: merkleClaimAddress,
        amount: mintAmount,
        responseDestination: owner.address,
      },
    ));
    finalRewardWalletBalance = await waitForRewardWalletBalance({
      client,
      rewardJettonWalletAddress,
      minimumBalance: amountRaw,
    });
  }

  await withToncenterRetry('set one-leaf Merkle root', () => merkleClaim.send(
    ownerSender,
    { value: toNano('0.05') },
    { $$type: 'SetMerkleRoot', batchId, merkleRoot },
  ));
  await waitForMerkleRoot({ merkleClaim, batchId, merkleRoot });

  const queryId = BigInt(Date.now());
  await withToncenterRetry('send ClaimReward', () => merkleClaim.send(
    claimantSender,
    { value: toNano(process.env.TESTNET_CLAIM_TON_VALUE || '0.15') },
    {
      $$type: 'ClaimReward',
      queryId,
      batchId,
      ledgerIdHash,
      recipient: claimant.address,
      amountRaw,
      proof,
    },
  ));

  const claimReceipt = await pollClaimReceipt({
    rpcUrl: endpoint,
    merkleClaimAddress,
    claimantAddress: claimant.address,
    queryId,
    batchId,
    ledgerIdHash,
    amountRaw,
  });

  console.log(JSON.stringify({
    submitted: true,
    network: 'ton-testnet',
    owner: addressToTestnetString(owner.address),
    claimant: addressToTestnetString(claimant.address),
    tokenAddress: addressToTestnetString(tokenAddress),
    merkleClaimAddress: addressToTestnetString(merkleClaimAddress),
    rewardJettonWalletAddress: addressToTestnetString(rewardJettonWalletAddress),
    rewardJettonWalletBalanceBefore: existingBalance.toString(),
    rewardJettonWalletBalanceAfterFunding: finalRewardWalletBalance.toString(),
    batchId: batchId.toString(),
    ledgerId,
    ledgerIdHash: uint256Hex(ledgerIdHash),
    ledgerIdHashRaw: ledgerIdHash.toString(),
    amountRaw: amountRaw.toString(),
    merkleRoot: uint256Hex(merkleRoot),
    proofBoc,
    claimReceipt,
    followUp: claimReceipt
      ? 'Submit claimReceipt.txHash to POST /v1/rewards/:ledgerId/claim-receipt.'
      : 'ClaimReward was submitted, but the MerkleClaim receipt was not found within the polling window.',
  }, null, 2));
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
