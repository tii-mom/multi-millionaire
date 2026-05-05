import { Address, beginCell, Cell, toNano } from "@ton/core";
import type { MerkleRewardProofWithBatch } from "./types";

const JETTON_TRANSFER_OPCODE = 0x0f8a7ea5;
const CLAIM_REWARD_OPCODE = 0x434c414d;
export const DEPOSIT_GOAL_TARGETS = [10_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000] as const;

function readPositiveBigInt(value: string, label: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error("non-positive");
    return parsed;
  } catch {
    throw new Error(`${label} must be a positive integer raw amount`);
  }
}

export function toRawTokenAmount(value: string, decimals = 9): string {
  const normalized = value.trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("token decimals must be between 0 and 18");
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    throw new Error("amount must be a non-negative decimal token amount");
  }
  const [whole, fractional = ""] = normalized.split(".");
  if (fractional.length > decimals) {
    throw new Error(`amount supports at most ${decimals} decimal places`);
  }
  const scale = 10n ** BigInt(decimals);
  const wholeRaw = BigInt(whole) * scale;
  const fractionalRaw = fractional
    ? BigInt(fractional.padEnd(decimals, "0"))
    : 0n;
  return (wholeRaw + fractionalRaw).toString();
}

export function rawTokenAmountToDisplayNumber(value: string, decimals = 9): number {
  const parsed = readPositiveBigInt(value, "amountRaw");
  return Number(parsed) / (10 ** decimals);
}

function readUint64(value: string | number | bigint, label: string): bigint {
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed <= 0n || parsed > (1n << 64n) - 1n) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeUint256Hex(value: string): bigint {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[a-fA-F0-9]{1,64}$/.test(hex)) {
    throw new Error("Invalid uint256 hex value");
  }
  return BigInt(`0x${hex}`);
}

function encodeProofCell(proof: string[]): Cell {
  if (proof.length === 0) {
    return beginCell().endCell();
  }
  function encodeNode(index: number): Cell {
    const item = proof[index];
    const [side, hash] = item.split(":");
    if ((side !== "left" && side !== "right") || !hash) {
      throw new Error("Invalid Merkle proof item");
    }
    let node = beginCell().storeBit(side === "right").storeUint(normalizeUint256Hex(hash), 256);
    if (index + 1 < proof.length) {
      node = node.storeRef(encodeNode(index + 1));
    }
    return node.endCell();
  }
  return beginCell().storeUint(proof.length, 16).storeRef(encodeNode(0)).endCell();
}

export function createTonQueryId() {
  const random = new Uint16Array(1);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(random);
  } else {
    random[0] = Math.floor(Math.random() * 65_536);
  }
  return ((BigInt(Date.now()) << 16n) + BigInt(random[0])).toString();
}

export function deriveLockVaultPositionId(input: { walletAddress: string; queryId: string | number | bigint }) {
  const queryId = readUint64(input.queryId, "queryId");
  const hashHex = beginCell()
    .storeAddress(Address.parse(input.walletAddress))
    .storeUint(queryId, 64)
    .endCell()
    .hash()
    .toString("hex");
  return BigInt(`0x${hashHex}`).toString();
}

export function buildDepositTransferBody(input: {
  seasonId: number;
  waveId: number;
  targetUsd9: string;
  amountRaw: string;
  lockVaultAddress: string;
  responseAddress: string;
  queryId?: string | number | bigint;
  forwardTon?: string;
}) {
  const targetUsd9 = readPositiveBigInt(input.targetUsd9, "targetUsd9");
  const forwardPayload = beginCell()
    .storeUint(input.seasonId, 8)
    .storeUint(input.waveId, 32)
    .storeUint(targetUsd9, 128)
    .endCell();
  const queryId = input.queryId === undefined ? BigInt(Date.now()) : readUint64(input.queryId, "queryId");
  return beginCell()
    .storeUint(JETTON_TRANSFER_OPCODE, 32)
    .storeUint(queryId, 64)
    .storeCoins(readPositiveBigInt(input.amountRaw, "amountRaw"))
    .storeAddress(Address.parse(input.lockVaultAddress))
    .storeAddress(Address.parse(input.responseAddress))
    .storeBit(false)
    .storeCoins(toNano(input.forwardTon || "0.03"))
    .storeBit(true)
    .storeRef(forwardPayload)
    .endCell()
    .toBoc()
    .toString("base64");
}

export async function buildClaimRewardBody(input: {
  ledgerId: string;
  proof: MerkleRewardProofWithBatch;
  recipientAddress: string;
  queryId?: string | number | bigint;
}) {
  const batchId = String((input.proof as any).contract_batch_id || input.proof.batch_id);
  const ledgerIdHash = String((input.proof as any).ledger_id_hash || `0x${await sha256Hex(input.ledgerId)}`);
  const proofBoc = String((input.proof as any).proof_boc || "");
  const proofCell = proofBoc ? Cell.fromBase64(proofBoc) : encodeProofCell(input.proof.proof);
  return beginCell()
    .storeUint(CLAIM_REWARD_OPCODE, 32)
    .storeUint(input.queryId === undefined ? BigInt(Date.now()) : readUint64(input.queryId, "queryId"), 64)
    .storeUint(readUint64(batchId, "batchId"), 64)
    .storeUint(normalizeUint256Hex(ledgerIdHash), 256)
    .storeAddress(Address.parse(input.recipientAddress))
    .storeCoins(readPositiveBigInt(input.proof.amount_raw, "amountRaw"))
    .storeRef(proofCell)
    .endCell()
    .toBoc()
    .toString("base64");
}
