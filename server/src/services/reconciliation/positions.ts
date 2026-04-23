import { ChainEventEnvelope } from '../contracts/types';

export interface PositionSnapshot {
  id: string;
  onchainPositionId: string;
  amountRaw: string;
  withdrawn: boolean;
}

export interface PositionReconciliationInput {
  chainEvents: ChainEventEnvelope[];
  positionsByOnchainId: Record<string, PositionSnapshot | undefined>;
}

export type PositionReconciliationActionType =
  | 'insert_missing_position'
  | 'mark_withdrawn'
  | 'review_unmatched_withdrawal'
  | 'review_invalid_event_payload'
  | 'noop';

export interface PositionReconciliationAction {
  type: PositionReconciliationActionType;
  onchainPositionId?: string;
  chainEventKey: string;
  reason: string;
}

function eventKey(event: ChainEventEnvelope): string {
  return `${event.chainId}:${event.txHash}:${event.logIndex}`;
}

function payloadString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function planPositionReconciliation(input: PositionReconciliationInput): PositionReconciliationAction[] {
  const actions: PositionReconciliationAction[] = [];

  for (const event of input.chainEvents) {
    if (event.eventName !== 'Deposited' && event.eventName !== 'Withdrawn') {
      continue;
    }

    const chainEventKey = eventKey(event);
    const onchainPositionId = payloadString(event.payload.positionId);

    if (!onchainPositionId) {
      actions.push({
        type: 'review_invalid_event_payload',
        chainEventKey,
        reason: `${event.eventName} event is missing payload.positionId.`,
      });
      continue;
    }

    const position = input.positionsByOnchainId[onchainPositionId];

    if (event.eventName === 'Deposited') {
      actions.push(
        position
          ? {
              type: 'noop',
              onchainPositionId,
              chainEventKey,
              reason: 'Position already exists for Deposited event.',
            }
          : {
              type: 'insert_missing_position',
              onchainPositionId,
              chainEventKey,
              reason: 'Deposited event has no matching position row.',
            }
      );
      continue;
    }

    if (!position) {
      actions.push({
        type: 'review_unmatched_withdrawal',
        onchainPositionId,
        chainEventKey,
        reason: 'Withdrawn event has no matching position row.',
      });
      continue;
    }

    actions.push(
      position.withdrawn
        ? {
            type: 'noop',
            onchainPositionId,
            chainEventKey,
            reason: 'Position is already marked withdrawn.',
          }
        : {
            type: 'mark_withdrawn',
            onchainPositionId,
            chainEventKey,
            reason: 'Withdrawn event should mark position as withdrawn.',
          }
    );
  }

  return actions;
}
