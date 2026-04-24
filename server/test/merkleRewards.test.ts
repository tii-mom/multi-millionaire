import { buildMerkleTree } from '../src/services/merkleRewards';

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
});
