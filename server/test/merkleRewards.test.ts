import { beginCell } from '@ton/core';
import { buildMerkleTree, getMerkleClaimVerifierDiagnostics, verifyMerkleClaimReceipt } from '../src/services/merkleRewards';
import { MERKLE_CLAIM_OPCODE } from '../src/services/tonMessages';

describe('Merkle reward helpers', () => {
  it('builds deterministic roots and proofs for reward leaves', () => {
    const input = [
      {
        ledgerId: 'ledger-1',
        beneficiaryUserId: 'user-1',
        beneficiaryWallet: 'WALLET-A',
        amountRaw: '100',
      },
      {
        ledgerId: 'ledger-2',
        beneficiaryUserId: 'user-2',
        beneficiaryWallet: 'wallet-b',
        amountRaw: '200',
      },
    ];

    const first = buildMerkleTree(input);
    const second = buildMerkleTree(input);

    expect(first.root).toBe(second.root);
    expect(first.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(first.leaves).toHaveLength(2);
    expect(first.leaves[0].proof).toHaveLength(1);
    expect(first.leaves[1].proof).toHaveLength(1);
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
    process.env.MERKLE_CLAIM_ADDRESS_TESTNET = 'kQBgpmYcdBHoG1D4t0AfSF8CLrOU4Ad4Sg94KmjzYs6JDKWg';
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
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: [{
          transaction_id: { lt: '123', hash: 'claim-hash' },
          in_msg: {
            source: 'kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl',
            destination: 'kQBgpmYcdBHoG1D4t0AfSF8CLrOU4Ad4Sg94KmjzYs6JDKWg',
            body,
          },
        }],
      }),
    } as any);

    expect(getMerkleClaimVerifierDiagnostics()).toMatchObject({ configured: true, status: 'ton_rpc' });
    await expect(verifyMerkleClaimReceipt({
      txHash: 'claim-hash',
      beneficiaryWallet: 'kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl',
      amountRaw: '500',
      leafHash: '0x04',
    })).resolves.toBeUndefined();

    fetchMock.mockRestore();
    process.env = originalEnv;
  });
});
