import { beginCell } from '@ton/core';
import {
  LOCK_VAULT_DEPOSIT_OPCODE,
  MERKLE_CLAIM_OPCODE,
  parseLockVaultDepositBody,
  parseMerkleClaimBody,
  TonMessageParseError,
} from '../src/services/tonMessages';

describe('TON Tact message parsers', () => {
  it('parses LockVault Deposit message bodies', () => {
    const body = beginCell()
      .storeUint(LOCK_VAULT_DEPOSIT_OPCODE, 32)
      .storeUint(BigInt('11'), 64)
      .storeUint(7, 32)
      .storeUint(BigInt('1000'), 128)
      .storeUint(BigInt('42'), 64)
      .endCell()
      .toBoc()
      .toString('base64');

    expect(parseLockVaultDepositBody(body)).toEqual({
      opcode: LOCK_VAULT_DEPOSIT_OPCODE,
      queryId: '11',
      waveId: 7,
      amountRaw: '1000',
      positionId: '42',
    });
  });

  it('parses Merkle ClaimReward message bodies', () => {
    const body = beginCell()
      .storeUint(MERKLE_CLAIM_OPCODE, 32)
      .storeUint(BigInt('1'), 64)
      .storeUint(BigInt('2'), 64)
      .storeUint(BigInt('3'), 256)
      .storeUint(BigInt('500'), 128)
      .storeUint(BigInt('4'), 256)
      .endCell()
      .toBoc()
      .toString('base64');

    expect(parseMerkleClaimBody(body)).toEqual({
      opcode: MERKLE_CLAIM_OPCODE,
      queryId: '1',
      batchId: '2',
      ledgerIdHash: '3',
      amountRaw: '500',
      leafHash: '4',
    });
  });

  it('rejects unexpected opcodes', () => {
    const body = beginCell().storeUint(0, 32).endCell().toBoc().toString('base64');
    expect(() => parseLockVaultDepositBody(body)).toThrow(TonMessageParseError);
  });
});
