import crypto from 'crypto';
import { Address } from '@ton/core';
import { keyPairFromSeed, sign } from '@ton/crypto';
import {
  getWalletSignatureVerifierDiagnostics,
  isPlausibleWalletAddress,
  verifyWalletSignature,
  WalletSignatureVerificationError,
} from '../src/services/walletSignatureVerifier';

function buildTonProofSignature(input: {
  address: Address;
  domain: string;
  payload: string;
  timestamp: number;
  publicKey: Buffer;
  secretKey: Buffer;
}) {
  const wc = Buffer.alloc(4);
  wc.writeInt32BE(input.address.workChain, 0);
  const domainBytes = Buffer.from(input.domain, 'utf8');
  const dl = Buffer.alloc(4);
  dl.writeUInt32LE(domainBytes.length, 0);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64LE(BigInt(input.timestamp), 0);
  const message = Buffer.concat([
    Buffer.from('ton-proof-item-v2/', 'utf8'),
    wc,
    input.address.hash,
    dl,
    domainBytes,
    ts,
    Buffer.from(input.payload, 'utf8'),
  ]);
  const messageHash = crypto.createHash('sha256').update(message).digest();
  const fullMessage = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from('ton-connect', 'utf8'),
    messageHash,
  ]);
  const signedHash = crypto.createHash('sha256').update(fullMessage).digest();
  return JSON.stringify({
    publicKey: input.publicKey.toString('hex'),
    proof: {
      timestamp: input.timestamp,
      domain: { lengthBytes: domainBytes.length, value: input.domain },
      signature: sign(signedHash, input.secretKey).toString('base64'),
      payload: input.payload,
    },
  });
}

describe('wallet signature verifier', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.WALLET_BINDING_ENABLED;
    delete process.env.WALLET_SIGNATURE_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts test signatures only outside production', () => {
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_SIGNATURE_MODE = 'test';

    expect(() => verifyWalletSignature({
      nonce: 'nonce-1',
      walletAddress: 'wallet-1',
      signature: 'test:nonce-1:wallet-1',
      signableMessage: 'message',
    })).not.toThrow();
  });

  it('rejects test signatures in production at runtime', () => {
    process.env.NODE_ENV = 'production';
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_SIGNATURE_MODE = 'test';

    expect(getWalletSignatureVerifierDiagnostics()).toMatchObject({
      configured: false,
      status: 'not_configured',
      mode: 'test',
    });
    expect(() => verifyWalletSignature({
      nonce: 'nonce-1',
      walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      signature: 'test:nonce-1:eqaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signableMessage: 'message',
    })).toThrow(WalletSignatureVerificationError);
  });

  it('validates TON-friendly address shapes and keeps fake wallets out of production', () => {
    expect(isPlausibleWalletAddress('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isPlausibleWalletAddress('0:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isPlausibleWalletAddress('not-a-wallet')).toBe(false);

    expect(isPlausibleWalletAddress('wallet-1')).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(isPlausibleWalletAddress('wallet-1')).toBe(false);
  });

  it('accepts TON proof signatures in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_SIGNATURE_MODE = 'ton_proof';
    process.env.WALLET_BINDING_MESSAGE_DOMAIN = 'mm.72h.lol';
    const keyPair = keyPairFromSeed(Buffer.alloc(32, 7));
    const address = new Address(0, Buffer.alloc(32, 9));
    const nonce = 'nonce-1';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = buildTonProofSignature({
      address,
      domain: 'mm.72h.lol',
      payload: nonce,
      timestamp,
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    });

    expect(getWalletSignatureVerifierDiagnostics()).toMatchObject({
      configured: true,
      status: 'ton_proof',
      mode: 'ton_proof',
    });
    expect(() => verifyWalletSignature({
      nonce,
      walletAddress: address.toString(),
      signature,
      signableMessage: 'message',
    })).not.toThrow();
  });

  it('rejects TON proof signatures for the wrong payload', () => {
    process.env.NODE_ENV = 'production';
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_SIGNATURE_MODE = 'ton_proof';
    process.env.WALLET_BINDING_MESSAGE_DOMAIN = 'mm.72h.lol';
    const keyPair = keyPairFromSeed(Buffer.alloc(32, 7));
    const address = new Address(0, Buffer.alloc(32, 9));
    const signature = buildTonProofSignature({
      address,
      domain: 'mm.72h.lol',
      payload: 'other-nonce',
      timestamp: Math.floor(Date.now() / 1000),
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    });

    expect(() => verifyWalletSignature({
      nonce: 'nonce-1',
      walletAddress: address.toString(),
      signature,
      signableMessage: 'message',
    })).toThrow(WalletSignatureVerificationError);
  });
});
