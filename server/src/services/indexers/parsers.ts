import { ContractIntegrationConfig, ContractRole, normalizeContractAddress } from '../contracts/config';

export type ChainEventName =
  | 'Deposited'
  | 'Withdrawn'
  | 'PriceConfirmed'
  | 'RewardBatchPublished'
  | 'RewardClaimed';

export type ApplyPlanTarget =
  | 'chain_events'
  | 'wallet_bindings'
  | 'positions'
  | 'price_rounds'
  | 'reward_batches'
  | 'reward_ledgers'
  | 'unlock_state'
  | 'review_queue';

export type ApplyPlanAction = 'insert' | 'upsert' | 'mark' | 'resolve' | 'review' | 'noop' | 'recompute';

export interface RawChainLog {
  chainId: string;
  contractAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  topics: string[];
  data: string;
  blockTime?: string | null;
  finalized?: boolean;
}

export interface DecodedChainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  chainId: string;
  contractRole: ContractRole;
  contractAddress: string;
  eventName: ChainEventName;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: string | null;
  finalized: boolean;
  payload: TPayload;
}

export interface ReceiptSnapshot {
  chainId: string;
  txHash: string;
  contractAddress: string;
  walletAddress: string;
  waveId: number;
  amountRaw: string;
  positionId?: string | null;
  logIndex?: number | null;
  blockNumber?: number | null;
  finalized?: boolean;
}

export interface ApplyPlanStep {
  target: ApplyPlanTarget;
  action: ApplyPlanAction;
  idempotencyKey: string;
  note: string;
  fields: Record<string, unknown>;
}

export interface DryRunParseReport {
  logKey: string;
  contractRole: ContractRole | 'unknown';
  eventName: ChainEventName | 'unknown';
  status: 'needs_decode' | 'ready' | 'needs_wallet_resolution' | 'needs_review' | 'unsupported_contract';
  warnings: string[];
  steps: ApplyPlanStep[];
}

function cleanAddress(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = normalizeContractAddress(value);
  return trimmed.length > 0 ? trimmed : null;
}

function buildLogKey(input: Pick<RawChainLog, 'chainId' | 'txHash' | 'logIndex'>): string {
  return `${input.chainId}:${input.txHash}:${input.logIndex}`;
}

function buildIdempotencyKey(input: Pick<RawChainLog, 'chainId' | 'txHash' | 'logIndex'>): string {
  return buildLogKey(input);
}

function readRecordField(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function readStringField(record: Record<string, unknown>, key: string): string | null {
  const value = readRecordField(record, key);
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumberField(record: Record<string, unknown>, key: string): number | null {
  const value = readRecordField(record, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function resolveContractRole(
  config: ContractIntegrationConfig,
  contractAddress: string
): ContractRole | 'unknown' {
  const normalizedAddress = cleanAddress(contractAddress);
  if (!normalizedAddress) {
    return 'unknown';
  }

  if (cleanAddress(config.token.address) === normalizedAddress) {
    return 'token';
  }
  if (cleanAddress(config.lockVault.address) === normalizedAddress) {
    return 'lock_vault';
  }
  if (cleanAddress(config.oracle.address) === normalizedAddress) {
    return 'oracle';
  }
  if (cleanAddress(config.rewardDistributor.address) === normalizedAddress) {
    return 'reward_distributor';
  }
  return 'unknown';
}

export function buildChainEventApplyPlan(event: DecodedChainEvent): ApplyPlanStep[] {
  const payload = event.payload as Record<string, unknown>;
  const key = buildIdempotencyKey(event);
  const steps: ApplyPlanStep[] = [
    {
      target: 'chain_events',
      action: 'insert',
      idempotencyKey: key,
      note: 'Persist the normalized log before any domain apply step.',
      fields: {
        chain_id: event.chainId,
        contract_address: event.contractAddress,
        contract_role: event.contractRole,
        event_name: event.eventName,
        tx_hash: event.txHash,
        log_index: event.logIndex,
        block_number: event.blockNumber,
        block_time: event.blockTime,
        finalized: event.finalized,
      },
    },
  ];

  switch (event.eventName) {
    case 'Deposited':
      steps.push(
        {
          target: 'wallet_bindings',
          action: 'resolve',
          idempotencyKey: key,
          note: 'Resolve the wallet to a verified user before any position write.',
          fields: {
            wallet_address: readStringField(payload, 'walletAddress'),
            chain_id: event.chainId,
          },
        },
        {
          target: 'positions',
          action: 'upsert',
          idempotencyKey: key,
          note: 'Plan the position upsert keyed by onchain position id.',
          fields: {
            onchain_position_id: readStringField(payload, 'positionId'),
            wallet_address: readStringField(payload, 'walletAddress'),
            wave_id: readNumberField(payload, 'waveId'),
            amount_raw: readStringField(payload, 'amountRaw'),
            entry_price: readStringField(payload, 'entryPrice'),
            unlock_multiplier_bps: readNumberField(payload, 'unlockMultiplierBps'),
          },
        }
      );
      break;
    case 'Withdrawn':
      steps.push(
        {
          target: 'positions',
          action: 'mark',
          idempotencyKey: key,
          note: 'Plan a withdrawn mark only for an existing position.',
          fields: {
            onchain_position_id: readStringField(payload, 'positionId'),
            wallet_address: readStringField(payload, 'walletAddress'),
            amount_raw: readStringField(payload, 'amountRaw'),
            withdrawn: true,
          },
        }
      );
      break;
    case 'PriceConfirmed':
      steps.push(
        {
          target: 'price_rounds',
          action: 'upsert',
          idempotencyKey: key,
          note: 'Plan the price round upsert from the oracle confirmation event.',
          fields: {
            round_id: readNumberField(payload, 'roundId'),
            price: readStringField(payload, 'price'),
            observed_at: readStringField(payload, 'observedAt'),
            confirmed_at: readStringField(payload, 'confirmedAt'),
            status: 'confirmed',
          },
        },
        {
          target: 'unlock_state',
          action: 'recompute',
          idempotencyKey: key,
          note: 'Schedule unlockability recomputation as a separate retryable step.',
          fields: {
            round_id: readNumberField(payload, 'roundId'),
            price: readStringField(payload, 'price'),
          },
        }
      );
      break;
    case 'RewardBatchPublished':
      steps.push(
        {
          target: 'reward_batches',
          action: 'upsert',
          idempotencyKey: key,
          note: 'Plan the published batch record after matching the approved ledger set.',
          fields: {
            batch_id: readNumberField(payload, 'batchId'),
            wave_id: readNumberField(payload, 'waveId'),
            merkle_root: readStringField(payload, 'merkleRoot'),
            total_amount_raw: readStringField(payload, 'totalAmountRaw'),
            status: 'published',
          },
        }
      );
      break;
    case 'RewardClaimed':
      steps.push(
        {
          target: 'wallet_bindings',
          action: 'resolve',
          idempotencyKey: key,
          note: 'Resolve claimant wallet ownership before ledger settlement.',
          fields: {
            claimant_address: readStringField(payload, 'claimantAddress'),
            chain_id: event.chainId,
          },
        },
        {
          target: 'reward_ledgers',
          action: 'mark',
          idempotencyKey: key,
          note: 'Plan the claimed ledger mark after proof and beneficiary checks.',
          fields: {
            batch_id: readNumberField(payload, 'batchId'),
            ledger_id: readStringField(payload, 'ledgerId'),
            claimant_address: readStringField(payload, 'claimantAddress'),
            amount_raw: readStringField(payload, 'amountRaw'),
            status: 'claimed',
          },
        }
      );
      break;
  }

  return steps;
}

export function buildOraclePriceRoundIngestPlan(
  event: DecodedChainEvent<Record<string, unknown>>
): ApplyPlanStep[] {
  if (event.eventName !== 'PriceConfirmed') {
    return buildChainEventApplyPlan(event);
  }

  return buildChainEventApplyPlan(event);
}

export function buildRewardDistributorClaimPlan(
  event: DecodedChainEvent<Record<string, unknown>>
): ApplyPlanStep[] {
  if (event.eventName !== 'RewardClaimed') {
    return buildChainEventApplyPlan(event);
  }

  return buildChainEventApplyPlan(event);
}

export function buildReceiptToPositionPlan(receipt: ReceiptSnapshot): ApplyPlanStep[] {
  const key = `${receipt.chainId}:${receipt.txHash}:${receipt.logIndex ?? 0}`;

  return [
    {
      target: 'chain_events',
      action: 'insert',
      idempotencyKey: key,
      note: 'Persist the receipt-backed log before any position apply.',
      fields: {
        chain_id: receipt.chainId,
        tx_hash: receipt.txHash,
        contract_address: receipt.contractAddress,
        wallet_address: receipt.walletAddress,
        wave_id: receipt.waveId,
        amount_raw: receipt.amountRaw,
        position_id: receipt.positionId ?? null,
        log_index: receipt.logIndex ?? null,
        block_number: receipt.blockNumber ?? null,
        finalized: receipt.finalized ?? false,
      },
    },
    {
      target: 'wallet_bindings',
      action: 'resolve',
      idempotencyKey: key,
      note: 'Resolve the bound wallet before a position record can be applied.',
      fields: {
        wallet_address: receipt.walletAddress,
        chain_id: receipt.chainId,
      },
    },
    {
      target: 'positions',
      action: 'upsert',
      idempotencyKey: key,
      note: 'Derive the on-chain position id from the confirmed receipt payload.',
      fields: {
        onchain_position_id: receipt.positionId ?? null,
        wallet_address: receipt.walletAddress,
        wave_id: receipt.waveId,
        amount_raw: receipt.amountRaw,
      },
    },
  ];
}

export function buildDryRunParseReport(
  config: ContractIntegrationConfig,
  log: RawChainLog,
  decodedEvent?: DecodedChainEvent
): DryRunParseReport {
  const contractRole = resolveContractRole(config, log.contractAddress);
  const logKey = buildLogKey(log);
  const warnings: string[] = [];

  if (contractRole === 'unknown') {
    return {
      logKey,
      contractRole: 'unknown',
      eventName: 'unknown',
      status: 'unsupported_contract',
      warnings: ['The log contract address does not match a configured integration target.'],
      steps: [
        {
          target: 'review_queue',
          action: 'review',
          idempotencyKey: logKey,
          note: 'Store the raw log for manual contract mapping review.',
          fields: {
            contract_address: log.contractAddress,
            tx_hash: log.txHash,
            log_index: log.logIndex,
            block_number: log.blockNumber,
          },
        },
      ],
    };
  }

  if (!decodedEvent) {
    return {
      logKey,
      contractRole,
      eventName: 'unknown',
      status: 'needs_decode',
      warnings: ['No ABI-decoded payload was supplied to the dry-run parser.'],
      steps: [
        {
          target: 'chain_events',
          action: 'insert',
          idempotencyKey: logKey,
          note: 'Persist the raw log and hold the event until ABI decode is available.',
          fields: {
            chain_id: log.chainId,
            contract_address: log.contractAddress,
            tx_hash: log.txHash,
            log_index: log.logIndex,
            block_number: log.blockNumber,
            finalized: log.finalized ?? false,
            topics: log.topics,
            data: log.data,
          },
        },
      ],
    };
  }

  const plan = buildChainEventApplyPlan(decodedEvent);
  const requiresWalletResolution = decodedEvent.eventName === 'Deposited' || decodedEvent.eventName === 'RewardClaimed';

  if (requiresWalletResolution) {
    warnings.push('This event requires wallet binding resolution before the apply phase can be finalized.');
  }

  return {
    logKey,
    contractRole,
    eventName: decodedEvent.eventName,
    status: requiresWalletResolution ? 'needs_wallet_resolution' : 'ready',
    warnings,
    steps: plan,
  };
}
