import { ChainEventEnvelope, ChainEventName, JsonObject } from '../contracts/types';

export type ChainEventTargetTable = 'positions' | 'price_rounds' | 'reward_batches' | 'reward_ledgers';

export type ChainEventMappingAction =
  | 'upsert_position'
  | 'mark_position_withdrawn'
  | 'upsert_price_round'
  | 'recalculate_unlockability'
  | 'publish_reward_batch'
  | 'mark_reward_ledger_claimed';

export interface ChainEventMapping {
  eventName: ChainEventName;
  action: ChainEventMappingAction;
  targetTable: ChainEventTargetTable;
  idempotencyKey: string;
  data: JsonObject;
  notes: string[];
}

function chainEventKey(event: ChainEventEnvelope): string {
  return `${event.chainId}:${event.txHash}:${event.logIndex}`;
}

export function mapChainEventToTargets(event: ChainEventEnvelope): ChainEventMapping[] {
  const idempotencyKey = chainEventKey(event);

  switch (event.eventName) {
    case 'Deposited':
      return [
        {
          eventName: event.eventName,
          action: 'upsert_position',
          targetTable: 'positions',
          idempotencyKey,
          data: {
            onchain_position_id: event.payload.positionId,
            user_id: event.payload.userId,
            wallet_address: event.payload.walletAddress,
            wave_id: event.payload.waveId,
            amount_raw: event.payload.amountRaw,
            entry_price: event.payload.entryPrice,
            unlock_multiplier_bps: event.payload.unlockMultiplierBps,
          },
          notes: ['Resolve wallet-to-user ownership before writing positions.'],
        },
      ];
    case 'Withdrawn':
      return [
        {
          eventName: event.eventName,
          action: 'mark_position_withdrawn',
          targetTable: 'positions',
          idempotencyKey,
          data: {
            onchain_position_id: event.payload.positionId,
            wallet_address: event.payload.walletAddress,
            amount_raw: event.payload.amountRaw,
            withdrawn: true,
          },
          notes: ['Only mark existing positions withdrawn after event finalization.'],
        },
      ];
    case 'PriceConfirmed':
      return [
        {
          eventName: event.eventName,
          action: 'upsert_price_round',
          targetTable: 'price_rounds',
          idempotencyKey,
          data: {
            round_id: event.payload.roundId,
            price: event.payload.price,
            observed_at: event.payload.observedAt,
            confirmed_at: event.payload.confirmedAt,
            status: 'confirmed',
          },
          notes: ['Preserve admin-submitted price flow until chain oracle is explicitly enabled.'],
        },
        {
          eventName: event.eventName,
          action: 'recalculate_unlockability',
          targetTable: 'positions',
          idempotencyKey,
          data: {
            round_id: event.payload.roundId,
            price: event.payload.price,
          },
          notes: ['Unlockability recalculation remains a Sprint 2 domain service.'],
        },
      ];
    case 'RewardBatchPublished':
      return [
        {
          eventName: event.eventName,
          action: 'publish_reward_batch',
          targetTable: 'reward_batches',
          idempotencyKey,
          data: {
            id: event.payload.batchId,
            wave_id: event.payload.waveId,
            merkle_root: event.payload.merkleRoot,
            total_amount: event.payload.totalAmountRaw,
            status: 'published',
          },
          notes: ['Batch publication must reconcile against approved reward ledgers.'],
        },
      ];
    case 'RewardClaimed':
      return [
        {
          eventName: event.eventName,
          action: 'mark_reward_ledger_claimed',
          targetTable: 'reward_ledgers',
          idempotencyKey,
          data: {
            batch_id: event.payload.batchId,
            ledger_id: event.payload.ledgerId,
            claimant_address: event.payload.claimantAddress,
            amount_raw: event.payload.amountRaw,
            status: 'claimed',
          },
          notes: ['Resolve claimant wallet to beneficiary before marking ledgers claimed.'],
        },
      ];
    default: {
      const exhaustiveCheck: never = event.eventName;
      return exhaustiveCheck;
    }
  }
}
