import 'dotenv/config';
import fs from 'fs';
import { Address, TonClient, WalletContractV4, toNano } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TestJettonMaster } from '../build/TestJetton/TestJetton_TestJettonMaster';

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeploy(client: TonClient, address: Address) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await client.getContractState(address);
    if (state.state === 'active') {
      return state;
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for ${address.toString({ testOnly: true })} deployment`);
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
    throw new Error('Refusing to deploy test Jetton: CHAIN_RPC_URL is not a testnet endpoint');
  }

  const mnemonic = required('TESTNET_DEPLOYER_MNEMONIC').split(/\s+/);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const expectedOwner = process.env.CHAIN_ADMIN_ADDRESS_TESTNET?.trim()
    ? Address.parse(process.env.CHAIN_ADMIN_ADDRESS_TESTNET)
    : null;
  if (expectedOwner && !wallet.address.equals(expectedOwner)) {
    throw new Error('TESTNET_DEPLOYER_MNEMONIC does not match CHAIN_ADMIN_ADDRESS_TESTNET');
  }

  const client = new TonClient({
    endpoint,
    apiKey: optionalTestnetApiKey(),
  });
  const openedWallet = client.open(wallet);
  const sender = openedWallet.sender(keyPair.secretKey);
  const testJetton = client.open(await TestJettonMaster.fromInit(wallet.address));

  console.log(JSON.stringify({
    network: 'ton-testnet',
    owner: wallet.address.toString({ testOnly: true }),
    tokenAddress: testJetton.address.toString({ testOnly: true }),
  }, null, 2));

  await withToncenterRetry('deploy TestJettonMaster', () => testJetton.send(sender, { value: toNano('0.08') }, null));
  const state = await waitForDeploy(client, testJetton.address);

  const mintAmountRaw = BigInt(process.env.TESTNET_JETTON_MINT_AMOUNT_RAW?.trim() || '1000000000000000000');
  if (mintAmountRaw <= 0n) {
    throw new Error('TESTNET_JETTON_MINT_AMOUNT_RAW must be a positive integer');
  }
  const mintRecipient = process.env.TESTNET_JETTON_MINT_RECIPIENT?.trim()
    ? Address.parse(process.env.TESTNET_JETTON_MINT_RECIPIENT)
    : wallet.address;

  await withToncenterRetry('mint test Jettons', () => testJetton.send(
    sender,
    { value: toNano('0.12') },
    {
      $$type: 'Mint',
      queryId: BigInt(Date.now()),
      recipient: mintRecipient,
      amount: mintAmountRaw,
      responseDestination: wallet.address,
    },
  ));
  const recipientJettonWallet = await testJetton.getGetWalletAddress(mintRecipient);

  const updates = {
    TOKEN_ADDRESS_TESTNET: testJetton.address.toString({ testOnly: true }),
  };
  if (process.env.UPDATE_ENV === 'true') {
    updateEnv(updates);
  }

  console.log(JSON.stringify({
    deployed: true,
    TOKEN_ADDRESS_TESTNET: updates.TOKEN_ADDRESS_TESTNET,
    deploymentLt: state.lastTransaction?.lt.toString() || '',
    minted: {
      recipient: mintRecipient.toString({ testOnly: true }),
      recipientJettonWallet: recipientJettonWallet.toString({ testOnly: true }),
      amountRaw: mintAmountRaw.toString(),
    },
    updatedEnv: process.env.UPDATE_ENV === 'true',
    followUp: 'Run UPDATE_ENV=true npm run contract:deploy:testnet, then derive/configure Jetton wallets.',
  }, null, 2));
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
