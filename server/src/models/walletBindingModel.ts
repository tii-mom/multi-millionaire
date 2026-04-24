import crypto from 'crypto';
import { query } from '../db';

export type WalletBindingStatus = 'pending' | 'verified' | 'revoked';
export type WalletBindIntentStatus = 'pending' | 'verified' | 'expired' | 'cancelled';

export interface WalletBindIntentRecord {
  id: string;
  user_id: string;
  chain_id: string;
  wallet_address: string;
  normalized_address: string;
  nonce: string;
  message_domain: string;
  signable_message: string;
  status: WalletBindIntentStatus;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WalletBindingRecord {
  id: string;
  user_id: string;
  chain_id: string;
  wallet_address: string;
  normalized_address: string;
  wallet_type: string | null;
  status: WalletBindingStatus;
  is_primary: boolean;
  verified_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const walletIntentColumns = `
  id, user_id, chain_id, wallet_address, normalized_address, nonce,
  message_domain, signable_message, status, expires_at, created_at, updated_at
`;

const walletBindingColumns = `
  id, user_id, chain_id, wallet_address, normalized_address, wallet_type,
  status, is_primary, verified_at, revoked_at, created_at, updated_at
`;

export function normalizeWalletAddress(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

export function buildWalletBindMessage(input: {
  domain: string;
  chainId: string;
  walletAddress: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return [
    `${input.domain} wallet binding`,
    `Chain: ${input.chainId}`,
    `Wallet: ${input.walletAddress}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join('\n');
}

export async function createWalletBindIntent(input: {
  userId: string;
  chainId: string;
  walletAddress: string;
  messageDomain: string;
  nonceTtlSeconds: number;
}): Promise<WalletBindIntentRecord> {
  const nonce = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + input.nonceTtlSeconds * 1000);
  const signableMessage = buildWalletBindMessage({
    domain: input.messageDomain,
    chainId: input.chainId,
    walletAddress: input.walletAddress,
    nonce,
    expiresAt,
  });

  const result = await query<WalletBindIntentRecord>(
    `INSERT INTO wallet_bind_intents (
       user_id, chain_id, wallet_address, normalized_address, nonce,
       message_domain, signable_message, status, expires_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW(), NOW())
     RETURNING ${walletIntentColumns}`,
    [
      input.userId,
      input.chainId,
      input.walletAddress,
      normalizeWalletAddress(input.walletAddress),
      nonce,
      input.messageDomain,
      signableMessage,
      expiresAt,
    ]
  );
  return result.rows[0];
}

export async function getWalletBindIntentForUser(userId: string, nonce: string): Promise<WalletBindIntentRecord | null> {
  const result = await query<WalletBindIntentRecord>(
    `SELECT ${walletIntentColumns}
     FROM wallet_bind_intents
     WHERE user_id = $1 AND nonce = $2`,
    [userId, nonce]
  );
  return result.rows[0] || null;
}

export async function markWalletBindIntentVerified(intentId: string): Promise<void> {
  await query(
    `UPDATE wallet_bind_intents
     SET status = 'verified', updated_at = NOW()
     WHERE id = $1`,
    [intentId]
  );
}

export async function upsertVerifiedWalletBinding(input: {
  userId: string;
  chainId: string;
  walletAddress: string;
  walletType?: string | null;
  isPrimary?: boolean;
}): Promise<WalletBindingRecord | null> {
  const normalizedAddress = normalizeWalletAddress(input.walletAddress);

  if (input.isPrimary !== false) {
    await query(
      `UPDATE wallet_bindings
       SET is_primary = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND chain_id = $2 AND status = 'verified'`,
      [input.userId, input.chainId]
    );
  }

  const result = await query<WalletBindingRecord>(
    `INSERT INTO wallet_bindings (
       user_id, chain_id, wallet_address, normalized_address, wallet_type,
       status, is_primary, verified_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'verified', $6, NOW(), NOW(), NOW())
     ON CONFLICT (chain_id, normalized_address)
     DO UPDATE SET
       wallet_address = EXCLUDED.wallet_address,
       wallet_type = EXCLUDED.wallet_type,
       status = 'verified',
       is_primary = EXCLUDED.is_primary,
       verified_at = NOW(),
       revoked_at = NULL,
       updated_at = NOW()
     WHERE wallet_bindings.user_id = EXCLUDED.user_id
     RETURNING ${walletBindingColumns}`,
    [
      input.userId,
      input.chainId,
      input.walletAddress,
      normalizedAddress,
      input.walletType || null,
      input.isPrimary !== false,
    ]
  );
  return result.rows[0];
}

export async function listWalletBindingsForUser(userId: string): Promise<WalletBindingRecord[]> {
  const result = await query<WalletBindingRecord>(
    `SELECT ${walletBindingColumns}
     FROM wallet_bindings
     WHERE user_id = $1 AND status = 'verified'
     ORDER BY is_primary DESC, verified_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function findVerifiedWalletBinding(chainId: string, walletAddress: string): Promise<WalletBindingRecord | null> {
  const result = await query<WalletBindingRecord>(
    `SELECT ${walletBindingColumns}
     FROM wallet_bindings
     WHERE chain_id = $1 AND normalized_address = $2 AND status = 'verified'`,
    [chainId, normalizeWalletAddress(walletAddress)]
  );
  return result.rows[0] || null;
}
