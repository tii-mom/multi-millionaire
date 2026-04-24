import { Address, beginCell } from '@ton/core';
import {
  buildMerkleTree,
  encodeMerkleProofCell,
  getMerkleClaimVerifierDiagnostics,
  hashLedgerId,
  verifyMerkleClaimReceipt,
} from '../src/services/merkleRewards';
import { MERKLE_CLAIM_OPCODE } from '../src/services/tonMessages';

describe('Merkle reward helpers', () => {
  const beneficiaryWallet = 'kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl';
  const merkleClaimAddress = 'kQBgpmYcdBHoG1D4t0AfSF8CLrOU4Ad4Sg94KmjzYs6JDKWg';
  const otherWallet = 'kQDdFuJo_tCecQe0ejR7iyTKd8ld5A6ur25jRdO6sGcEklRt';

  function buildClaimBody(input: { recipient?: string; amountRaw?: string } = {}): string {
    return beginCell()
      .storeUint(MERKLE_CLAIM_OPCODE, 32)
      .storeUint(BigInt('1'), 64)
      .storeUint(BigInt('2'), 64)
      .storeUint(BigInt('3'), 256)
      .storeAddress(Address.parse(input.recipient || beneficiaryWallet))
      .storeCoins(BigInt(input.amountRaw || '500'))
      .storeRef(beginCell().storeUint(BigInt('4'), 256).endCell())
      .endCell()
      .toBoc()
      .toString('base64');
  }

  it('builds deterministic roots and proofs for reward leaves', () => {
    const input = [
      {
        ledgerId: 'ledger-1',
        beneficiaryUserId: 'user-1',
        beneficiaryWallet,
        amountRaw: '100',
      },
      {
        ledgerId: 'ledger-2',
        beneficiaryUserId: 'user-2',
        beneficiaryWallet: otherWallet,
        amountRaw: '200',
      },
    ];

    const first = buildMerkleTree(input, { batchId: '2' });
    const second = buildMerkleTree(input, { batchId: '2' });

    expect(first.root).toBe(second.root);
    expect(first.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(first.leaves).toHaveLength(2);
    expect(first.leaves[0].ledgerIdHash).toBe(hashLedgerId('ledger-1'));
    expect(first.leaves[0].proof[0]).toMatch(/^right:0x[0-9a-f]{64}$/);
    expect(first.leaves[1].proof[0]).toMatch(/^left:0x[0-9a-f]{64}$/);
    expect(first.leaves[0].proof).toHaveLength(1);
    expect(first.leaves[1].proof).toHaveLength(1);
    expect(encodeMerkleProofCell(first.leaves[0].proof)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('returns an empty root for empty batches', () => {
    const tree = buildMerkleTree([]);

    expect(tree.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(tree.leaves).toEqual([]);
  });

  it('verifies Merkle claim receipts through TON RPC responses', async () => {
    const originalEnv = { ...process.env };
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.REWARD_CLAIM_MODEL = 'merkle';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.MERKLE_CLAIM_ADDRESS_TESTNET = merkleClaimAddress;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: [{
          transaction_id: { lt: '123', hash: 'claim-hash' },
          in_msg: {
            source: beneficiaryWallet,
            destination: merkleClaimAddress,
            body: buildClaimBody(),
          },
        }],
      }),
    } as any);

    expect(getMerkleClaimVerifierDiagnostics()).toMatchObject({ configured: true, status: 'ton_rpc' });
    await expect(verifyMerkleClaimReceipt({
      txHash: 'claim-hash',
      beneficiaryWallet,
      amountRaw: '500',
      ledgerIdHash: '0x03',
    })).resolves.toMatchObject({
      txHash: 'claim-hash',
      amountRaw: '500',
      batchId: '2',
      ledgerIdHash: '3',
      finalized: true,
    });

    fetchMock.mockRestore();
    process.env = originalEnv;
  });

  it('rejects Merkle claim receipts with the wrong explicit recipient', async () => {
    const originalEnv = { ...process.env };
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.REWARD_CLAIM_MODEL = 'merkle';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.MERKLE_CLAIM_ADDRESS_TESTNET = merkleClaimAddress;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: [{
          transaction_id: { lt: '123', hash: 'claim-hash' },
          in_msg: {
            source: beneficiaryWallet,
            destination: merkleClaimAddress,
            body: buildClaimBody({ recipient: otherWallet }),
          },
        }],
      }),
    } as any);

    await expect(verifyMerkleClaimReceipt({
      txHash: 'claim-hash',
      beneficiaryWallet,
      amountRaw: '500',
    })).rejects.toMatchObject({
      status: 409,
      code: 'RECIPIENT_MISMATCH',
    });

    fetchMock.mockRestore();
    process.env = originalEnv;
  });
});
