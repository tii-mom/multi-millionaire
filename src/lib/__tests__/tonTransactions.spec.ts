import { Address, Cell } from "@ton/core";
import { buildClaimRewardBody, buildDepositTransferBody } from "../tonTransactions";
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

  it("encodes TonConnect jetton deposit transfer body deterministically", () => {
    const lockVaultAddress = rawAddress("1");
    const responseAddress = rawAddress("2");

    const body = buildDepositTransferBody({
      waveId: 7,
      positionId: "42",
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
    expect(forwardPayload.loadUint(32)).toBe(7);
    expect(forwardPayload.loadUintBig(64)).toBe(42n);
    forwardPayload.endParse();
    slice.endParse();
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
    expect(proofSlice.loadUint(8)).toBe(2);
    expect(proofSlice.loadBit()).toBe(false);
    expect(proofSlice.loadUintBig(256)).toBe(BigInt(`0x${"a".repeat(64)}`));
    expect(proofSlice.loadBit()).toBe(true);
    expect(proofSlice.loadUintBig(256)).toBe(BigInt(`0x${"b".repeat(64)}`));
    proofSlice.endParse();
    slice.endParse();
  });
});
