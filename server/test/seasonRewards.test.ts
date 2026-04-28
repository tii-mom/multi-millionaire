import {
  assertSeasonWarPoolTotals,
  assertSeasonClaimProofCapacity,
  buildSeasonRewardLeaf,
  buildSeasonRewardMerkleTree,
  calculateSeasonWarPoolAmounts,
  calculateSeasonWarPoolAmountsForRounds,
  calculateSeasonRewardRootFromProof,
  encodeSeasonClaimProofCell,
  hashSeasonRewardSourceId,
  SEASON_WAR_POOL_AMOUNTS_RAW,
  SEASON_WAR_ROUND_REWARD_RAW,
} from '../src/services/seasonRewards';

describe('Season War reward helpers', () => {
  const recipientWallet = 'kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl';
  const otherWallet = 'kQDdFuJo_tCecQe0ejR7iyTKd8ld5A6ur25jRdO6sGcEklRt';
  const tokenAddress = '0:1111111111111111111111111111111111111111111111111111111111111111';
  const seasonClaimAddress = 'kQBgpmYcdBHoG1D4t0AfSF8CLrOU4Ad4Sg94KmjzYs6JDKWg';

  const options = {
    chainId: 'ton-testnet',
    tokenAddress,
    contractAddress: seasonClaimAddress,
  };

  it('exposes the fixed 500,000,000 72H four-pool split', () => {
    expect(SEASON_WAR_ROUND_REWARD_RAW).toBe('500000000000000000');
    expect(calculateSeasonWarPoolAmounts()).toEqual({
      personal: '250000000000000000',
      team: '125000000000000000',
      referral: '75000000000000000',
      leaderboard: '50000000000000000',
    });
    expect(calculateSeasonWarPoolAmounts()).toEqual(SEASON_WAR_POOL_AMOUNTS_RAW);
  });

  it('builds deterministic SeasonClaim leaves with the four pool amounts and total', () => {
    const input = {
      seasonId: 1,
      beneficiaryUserId: 'user-1',
      recipientWallet,
      personalAmountRaw: '100',
      teamAmountRaw: '200',
      referralAmountRaw: '300',
      leaderboardAmountRaw: '400',
    };

    const first = buildSeasonRewardLeaf(input, options);
    const second = buildSeasonRewardLeaf(input, options);

    expect(first.leafHash).toBe(second.leafHash);
    expect(first.leafHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(first.totalAmountRaw).toBe('1000');
    expect(first.seasonId).toBe('1');
  });

  it('validates full round pool totals before building the Merkle tree', () => {
    const leaves = [
      {
        seasonId: 1,
        beneficiaryUserId: 'user-1',
        recipientWallet,
        personalAmountRaw: '200000000000000000',
        teamAmountRaw: '100000000000000000',
        referralAmountRaw: '50000000000000000',
        leaderboardAmountRaw: '30000000000000000',
      },
      {
        seasonId: 1,
        beneficiaryUserId: 'user-2',
        recipientWallet: otherWallet,
        personalAmountRaw: '50000000000000000',
        teamAmountRaw: '25000000000000000',
        referralAmountRaw: '25000000000000000',
        leaderboardAmountRaw: '20000000000000000',
      },
    ];

    expect(assertSeasonWarPoolTotals(leaves)).toEqual(SEASON_WAR_POOL_AMOUNTS_RAW);
    const tree = buildSeasonRewardMerkleTree(leaves, options);

    expect(tree.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(tree.totalAmountRaw).toBe('500000000000000000');
    expect(tree.leaves).toHaveLength(2);
    expect(tree.leaves[0].proof).toHaveLength(1);
    expect(tree.leaves[1].proof).toHaveLength(1);
    expect(calculateSeasonRewardRootFromProof(tree.leaves[0].leafHash, tree.leaves[0].proof)).toBe(tree.root);
    expect(encodeSeasonClaimProofCell(tree.leaves[0].proof)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('encodes SeasonClaim proofs as consecutive direction/hash pairs', () => {
    const leaves = [
      recipientWallet,
      otherWallet,
      '0:2222222222222222222222222222222222222222222222222222222222222222',
      '0:3333333333333333333333333333333333333333333333333333333333333333',
    ]
      .map((wallet, index) => ({
        seasonId: 1,
        beneficiaryUserId: `user-${index + 1}`,
        recipientWallet: wallet,
        personalAmountRaw: index === 0 ? SEASON_WAR_POOL_AMOUNTS_RAW.personal : '0',
        teamAmountRaw: index === 1 ? SEASON_WAR_POOL_AMOUNTS_RAW.team : '0',
        referralAmountRaw: index === 2 ? SEASON_WAR_POOL_AMOUNTS_RAW.referral : '0',
        leaderboardAmountRaw: index === 3 ? SEASON_WAR_POOL_AMOUNTS_RAW.leaderboard : '0',
      }));

    const tree = buildSeasonRewardMerkleTree(leaves, options);

    for (const leaf of tree.leaves) {
      expect(calculateSeasonRewardRootFromProof(leaf.leafHash, leaf.proof)).toBe(tree.root);
      expect(encodeSeasonClaimProofCell(leaf.proof)).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
  });

  it('rejects proof cells that cannot fit the deployed SeasonClaim single-cell format', () => {
    const proof = [
      `left:${'0x'.padEnd(66, '1')}`,
      `right:${'0x'.padEnd(66, '2')}`,
      `left:${'0x'.padEnd(66, '3')}`,
      `right:${'0x'.padEnd(66, '4')}`,
    ];

    expect(() => encodeSeasonClaimProofCell(proof)).toThrow('single-cell proof format capacity');
    expect(() => assertSeasonClaimProofCapacity(8)).not.toThrow();
    expect(() => assertSeasonClaimProofCapacity(9)).toThrow('supports at most 8 leaves');
  });

  it('validates full season pool totals by successful round count', () => {
    const seventeenRoundTotals = calculateSeasonWarPoolAmountsForRounds(17);
    expect(seventeenRoundTotals).toEqual({
      personal: '4250000000000000000',
      team: '2125000000000000000',
      referral: '1275000000000000000',
      leaderboard: '850000000000000000',
    });

    const tree = buildSeasonRewardMerkleTree([{
      seasonId: 1,
      beneficiaryUserId: 'user-1',
      recipientWallet,
      personalAmountRaw: seventeenRoundTotals.personal,
      teamAmountRaw: seventeenRoundTotals.team,
      referralAmountRaw: seventeenRoundTotals.referral,
      leaderboardAmountRaw: seventeenRoundTotals.leaderboard,
    }], { ...options, successfulRoundCount: 17 });

    expect(tree.poolTotals).toEqual(seventeenRoundTotals);
    expect(tree.totalAmountRaw).toBe('8500000000000000000');
    expect(tree.leaves[0].totalAmountRaw).toBe('8500000000000000000');
  });

  it('rejects under-allocated or malformed season rewards', () => {
    expect(() => buildSeasonRewardMerkleTree([{
      seasonId: 1,
      recipientWallet,
      personalAmountRaw: '1',
      teamAmountRaw: '0',
      referralAmountRaw: '0',
      leaderboardAmountRaw: '0',
    }], options)).toThrow('personal pool total 1 does not match 250000000');

    expect(() => buildSeasonRewardLeaf({
      seasonId: 1,
      recipientWallet,
      personalAmountRaw: '-1',
      teamAmountRaw: '0',
      referralAmountRaw: '0',
      leaderboardAmountRaw: '0',
    }, options)).toThrow('personalAmountRaw must be a non-negative integer string');
  });

  it('derives a stable source id for optional reward ledger bridging', () => {
    expect(hashSeasonRewardSourceId(1, recipientWallet)).toBe(hashSeasonRewardSourceId('1', recipientWallet));
    expect(hashSeasonRewardSourceId(1, recipientWallet)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
