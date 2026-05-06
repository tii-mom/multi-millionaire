import { Address, Cell } from "@ton/core";
import { DEPOSIT_GOAL_TARGETS, buildClaimRewardBody, buildDepositTransferBody, createTonQueryId, deriveLockVaultPositionId, rawTokenAmountToDisplayNumber, toRawTokenAmount } from "../tonTransactions";
import type { MerkleRewardProofWithBatch } from "../types";

const JETTON_TRANSFER_OPCODE = 0x0f8a7ea5;
const CLAIM_REWARD_OPCODE = 0x434c414d;

function rawAddress(seed: string) {
  return `0:${seed.repeat(64)}`;
}

describe("ton transaction body builders", () => {
  const dateNow = jest.spyOn(Date, "now");

  beforeEach(() => {
    dateNow.mockReturnValue(1_714_000_000_123);
  });

  afterAll(() => {
    dateNow.mockRestore();
  });

  it("exposes exactly the six supported DepositVault USD target tiers", () => {
    expect(DEPOSIT_GOAL_TARGETS).toEqual([10_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000]);
  });

  it("encodes TonConnect jetton deposit transfer body deterministically", () => {
    const lockVaultAddress = rawAddress("1");
    const responseAddress = rawAddress("2");

    const body = buildDepositTransferBody({
      seasonId: 2,
      waveId: 7,
      targetUsd9: "10000000000000",
      amountRaw: "123456789",
      lockVaultAddress,
      responseAddress,
      forwardTon: "0.05",
    });

    const slice = Cell.fromBase64(body).beginParse();
    expect(slice.loadUint(32)).toBe(JETTON_TRANSFER_OPCODE);
    expect(slice.loadUintBig(64)).toBe(1_714_000_000_123n);
    expect(slice.loadCoins()).toBe(123456789n);
    expect(slice.loadAddress().equals(Address.parse(lockVaultAddress))).toBe(true);
    expect(slice.loadAddress().equals(Address.parse(responseAddress))).toBe(true);
    expect(slice.loadBit()).toBe(false);
    expect(slice.loadCoins()).toBe(50_000_000n);
    expect(slice.loadBit()).toBe(true);

    const forwardPayload = slice.loadRef().beginParse();
    expect(forwardPayload.loadUint(8)).toBe(2);
    expect(forwardPayload.loadUint(32)).toBe(7);
    expect(forwardPayload.loadUintBig(128)).toBe(10000000000000n);
    forwardPayload.endParse();
    slice.endParse();

    const positionId = deriveLockVaultPositionId({
      walletAddress: responseAddress,
      queryId: "1",
    });
    expect(positionId).toMatch(/^\d+$/);
    expect(positionId.length).toBeGreaterThan(60);
  });

  it("creates uint64 query ids with time and random entropy", () => {
    const first = BigInt(createTonQueryId());
    const second = BigInt(createTonQueryId());

    expect(first).toBeGreaterThan(1_714_000_000_123n);
    expect(first).toBeLessThan(1n << 64n);
    expect(second).toBeLessThan(1n << 64n);
  });

  it("converts whole-token display amounts to raw Jetton units", () => {
    expect(toRawTokenAmount("1", 9)).toBe("1000000000");
    expect(toRawTokenAmount("1.5", 9)).toBe("1500000000");
    expect(toRawTokenAmount("1.25", 9)).toBe("1250000000");
    expect(toRawTokenAmount("0.000000001", 9)).toBe("1");
    expect(toRawTokenAmount("1000000000", 9)).toBe("1000000000000000000");
    expect(rawTokenAmountToDisplayNumber("1000000000", 9)).toBe(1);
    expect(() => toRawTokenAmount("1.1234567891", 9)).toThrow(/decimal places/);
    expect(() => toRawTokenAmount("-1", 9)).toThrow(/decimal/);
    expect(() => toRawTokenAmount("1e3", 9)).toThrow(/decimal/);
  });

  it("encodes MerkleClaim claim body with recipient, amount, ledger hash, and proof", async () => {
    const recipientAddress = rawAddress("3");
    const proof: MerkleRewardProofWithBatch = {
      id: "proof-1",
      batch_id: "batch-row-1",
      reward_ledger_id: "ledger-1",
      beneficiary_user_id: "user-1",
      beneficiary_wallet: recipientAddress,
      amount_raw: "987654321",
      leaf_hash: "0x01",
      proof: [
        `left:${"a".repeat(64)}`,
        `right:${"b".repeat(64)}`,
      ],
      claim_status: "proof_available",
      claim_tx_hash: null,
      claim_chain_event_id: null,
      created_at: "2026-04-25T00:00:00.000Z",
      updated_at: "2026-04-25T00:00:00.000Z",
      chain_id: "ton-testnet",
      token_address: rawAddress("4"),
      merkle_root: `0x${"c".repeat(64)}`,
      batch_status: "active",
      published_tx_hash: null,
      contract_batch_id: "9",
      ledger_id_hash: `0x${"d".repeat(64)}`,
    };

    const body = await buildClaimRewardBody({
      ledgerId: "ledger-1",
      proof,
      recipientAddress,
    });

    const slice = Cell.fromBase64(body).beginParse();
    expect(slice.loadUint(32)).toBe(CLAIM_REWARD_OPCODE);
    expect(slice.loadUintBig(64)).toBe(1_714_000_000_123n);
    expect(slice.loadUintBig(64)).toBe(9n);
    expect(slice.loadUintBig(256)).toBe(BigInt(`0x${"d".repeat(64)}`));
    expect(slice.loadAddress().equals(Address.parse(recipientAddress))).toBe(true);
    expect(slice.loadCoins()).toBe(987654321n);

    const proofSlice = slice.loadRef().beginParse();
    expect(proofSlice.loadUint(16)).toBe(2);
    const firstNode = proofSlice.loadRef().beginParse();
    expect(firstNode.loadBit()).toBe(false);
    expect(firstNode.loadUintBig(256)).toBe(BigInt(`0x${"a".repeat(64)}`));
    const secondNode = firstNode.loadRef().beginParse();
    expect(secondNode.loadBit()).toBe(true);
    expect(secondNode.loadUintBig(256)).toBe(BigInt(`0x${"b".repeat(64)}`));
    secondNode.endParse();
    firstNode.endParse();
    proofSlice.endParse();
    slice.endParse();
  });
});
