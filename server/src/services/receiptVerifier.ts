import { loadContractIntegrationConfig } from './contracts/config';

export type ChainReceiptVerifierStatus = 'disabled' | 'test' | 'not_configured';

export interface DepositReceiptInput {
  txHash: string;
  logIndex?: number;
  walletAddress?: string;
  contractAddress?: string;
  amountRaw?: string;
  positionId?: string;
  blockNumber?: number;
  blockTime?: string;
  finalized?: boolean;
}

export interface VerifiedDepositReceipt {
  chainId: string;
  txHash: string;
  logIndex: number;
  walletAddress: string;
  contractAddress: string;
  amountRaw: string;
  positionId: string;
  blockNumber: number | null;
  blockTime: string | null;
  finalized: boolean;
}

export interface ChainReceiptVerifierDiagnostics {
  configured: boolean;
  status: ChainReceiptVerifierStatus;
  mode: string;
  receiptVerificationEnabled: boolean;
}

export interface ChainReceiptVerifier {
  readonly mode: ChainReceiptVerifierStatus;
  getDiagnostics(): ChainReceiptVerifierDiagnostics;
  verifyDepositReceipt(input: DepositReceiptInput): Promise<VerifiedDepositReceipt>;
}

export class ReceiptVerificationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ReceiptVerificationError';
    this.status = status;
    this.code = code;
  }
}

function ensureString(value: unknown, code: string, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReceiptVerificationError(400, code, message);
  }
  return value.trim();
}

class DisabledChainReceiptVerifier implements ChainReceiptVerifier {
  readonly mode = 'disabled' as const;

  getDiagnostics(): ChainReceiptVerifierDiagnostics {
    const config = loadContractIntegrationConfig();
    return {
      configured: false,
      status: 'disabled',
      mode: 'disabled',
      receiptVerificationEnabled: config.receipt.enabled,
    };
  }

  async verifyDepositReceipt(): Promise<VerifiedDepositReceipt> {
    throw new ReceiptVerificationError(503, 'RECEIPT_VERIFICATION_DISABLED', 'Chain receipt verification is not enabled');
  }
}

class NotConfiguredChainReceiptVerifier implements ChainReceiptVerifier {
  readonly mode = 'not_configured' as const;

  getDiagnostics(): ChainReceiptVerifierDiagnostics {
    const config = loadContractIntegrationConfig();
    return {
      configured: false,
      status: 'not_configured',
      mode: 'not_configured',
      receiptVerificationEnabled: config.receipt.enabled,
    };
  }

  async verifyDepositReceipt(): Promise<VerifiedDepositReceipt> {
    throw new ReceiptVerificationError(
      503,
      'RECEIPT_VERIFIER_NOT_CONFIGURED',
      'No production receipt verifier is configured for this chain yet'
    );
  }
}

class TestChainReceiptVerifier implements ChainReceiptVerifier {
  readonly mode = 'test' as const;

  getDiagnostics(): ChainReceiptVerifierDiagnostics {
    const config = loadContractIntegrationConfig();
    return {
      configured: true,
      status: 'test',
      mode: 'test',
      receiptVerificationEnabled: config.receipt.enabled,
    };
  }

  async verifyDepositReceipt(input: DepositReceiptInput): Promise<VerifiedDepositReceipt> {
    const config = loadContractIntegrationConfig();
    const txHash = ensureString(input.txHash, 'INVALID_RECEIPT', 'txHash is required');

    const walletAddress = ensureString(input.walletAddress, 'INVALID_RECEIPT', 'walletAddress is required in receipt test mode');
    const contractAddress = ensureString(input.contractAddress, 'INVALID_RECEIPT', 'contractAddress is required in receipt test mode');
    const amountRaw = ensureString(input.amountRaw, 'INVALID_RECEIPT', 'amountRaw is required in receipt test mode');
    const positionId = ensureString(input.positionId, 'INVALID_RECEIPT', 'positionId is required in receipt test mode');
    const finalized = input.finalized === true;

    if (!finalized) {
      throw new ReceiptVerificationError(409, 'RECEIPT_NOT_FINALIZED', 'Deposit receipt is not finalized yet');
    }
    if (config.lockVault.address && contractAddress !== config.lockVault.address) {
      throw new ReceiptVerificationError(409, 'CONTRACT_MISMATCH', 'Receipt does not belong to configured LockVault');
    }
    try {
      if (BigInt(amountRaw) <= BigInt(0)) {
        throw new Error('non-positive');
      }
    } catch {
      throw new ReceiptVerificationError(400, 'INVALID_AMOUNT', 'Receipt amount must be a positive raw token amount');
    }

    return {
      chainId: config.chainId,
      txHash,
      logIndex: input.logIndex ?? 0,
      walletAddress,
      contractAddress,
      amountRaw,
      positionId,
      blockNumber: input.blockNumber ?? null,
      blockTime: input.blockTime ?? null,
      finalized,
    };
  }
}

function getRequestedVerifierMode(): string {
  return (process.env.CHAIN_RECEIPT_VERIFIER || '').trim().toLowerCase();
}

export function getChainReceiptVerifier(): ChainReceiptVerifier {
  const config = loadContractIntegrationConfig();
  if (!config.receipt.enabled) {
    return new DisabledChainReceiptVerifier();
  }

  if (getRequestedVerifierMode() === 'test') {
    return new TestChainReceiptVerifier();
  }

  return new NotConfiguredChainReceiptVerifier();
}

export function getReceiptVerifierDiagnostics(): ChainReceiptVerifierDiagnostics {
  return getChainReceiptVerifier().getDiagnostics();
}

export async function verifyDepositReceipt(input: DepositReceiptInput): Promise<VerifiedDepositReceipt> {
  return getChainReceiptVerifier().verifyDepositReceipt(input);
}
