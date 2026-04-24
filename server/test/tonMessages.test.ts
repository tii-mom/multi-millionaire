import { Address, beginCell } from '@ton/core';
import {
  JETTON_TRANSFER_NOTIFICATION_OPCODE,
  LOCK_VAULT_DEPOSIT_OPCODE,
  MERKLE_CLAIM_OPCODE,
  findDepositTransaction,
  parseLockVaultDepositBody,
  parseMerkleClaimBody,
  TonMessageParseError,
} from '../src/services/tonMessages';

describe('TON Tact message parsers', () => {
  const walletAddress = 'kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl';
  const wallet = Address.parse(walletAddress);

  it('parses Jetton transfer_notification deposit bodies with inline metadata', () => {
    const body = beginCell()
      .storeUint(JETTON_TRANSFER_NOTIFICATION_OPCODE, 32)
      .storeUint(BigInt('11'), 64)
      .storeCoins(BigInt('1000'))
      .storeAddress(wallet)
      .storeBit(false)
      .storeUint(7, 32)
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
      senderAddress: wallet.toRawString().toLowerCase(),
    });
  });

  it('parses Jetton transfer_notification deposit bodies with metadata in a ref payload', () => {
    const forwardPayload = beginCell()
      .storeUint(8, 32)
      .storeUint(BigInt('43'), 64)
      .endCell();
    const body = beginCell()
      .storeUint(LOCK_VAULT_DEPOSIT_OPCODE, 32)
      .storeUint(BigInt('12'), 64)
      .storeCoins(BigInt('2000'))
      .storeAddress(wallet)
      .storeBit(true)
      .storeRef(forwardPayload)
      .endCell()
      .toBoc()
      .toString('base64');

    expect(parseLockVaultDepositBody(body)).toMatchObject({
      queryId: '12',
      waveId: 8,
      amountRaw: '2000',
      positionId: '43',
      senderAddress: wallet.toRawString().toLowerCase(),
    });
  });

  it('ignores failed TON transactions when searching receipts', () => {
    const body = beginCell()
      .storeUint(JETTON_TRANSFER_NOTIFICATION_OPCODE, 32)
      .storeUint(BigInt('11'), 64)
      .storeCoins(BigInt('1000'))
      .storeAddress(wallet)
      .storeBit(false)
      .storeUint(7, 32)
      .storeUint(BigInt('42'), 64)
      .endCell()
      .toBoc()
      .toString('base64');

    expect(findDepositTransaction({
      txHash: 'tx-hash',
      lockVaultAddress: walletAddress,
      transactions: [{
        transaction_id: { hash: 'tx-hash' },
        in_msg: {
          source: walletAddress,
          destination: walletAddress,
          body,
        },
        description: {
          aborted: true,
          compute_ph: { success: false, exit_code: 1003 },
        },
      }],
    })).toBeNull();
  });

  it('parses Merkle ClaimReward message bodies', () => {
    const body = beginCell()
      .storeUint(MERKLE_CLAIM_OPCODE, 32)
      .storeUint(BigInt('1'), 64)
      .storeUint(BigInt('2'), 64)
      .storeUint(BigInt('3'), 256)
      .storeAddress(wallet)
      .storeCoins(BigInt('500'))
      .storeRef(beginCell().storeUint(BigInt('4'), 256).endCell())
      .endCell()
      .toBoc()
      .toString('base64');

    expect(parseMerkleClaimBody(body)).toEqual({
      opcode: MERKLE_CLAIM_OPCODE,
      queryId: '1',
      batchId: '2',
      ledgerIdHash: '3',
      recipient: wallet.toRawString().toLowerCase(),
      amountRaw: '500',
    });
  });

  it('rejects unexpected opcodes', () => {
    const body = beginCell().storeUint(0, 32).endCell().toBoc().toString('base64');
    expect(() => parseLockVaultDepositBody(body)).toThrow(TonMessageParseError);
  });
});
