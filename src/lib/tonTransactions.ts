import { Address, beginCell, Cell, toNano } from "@ton/core";
import type { MerkleRewardProofWithBatch } from "./types";

const JETTON_TRANSFER_OPCODE = 0x0f8a7ea5;
const CLAIM_REWARD_OPCODE = 0x434c414d;

function readPositiveBigInt(value: string, label: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error("non-positive");
    return parsed;
  } catch {
    throw new Error(`${label} must be a positive integer raw amount`);
  }
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
  let builder = beginCell().storeUint(proof.length, 8);
  for (const item of proof) {
    const [side, hash] = item.split(":");
    if ((side !== "left" && side !== "right") || !hash) {
      throw new Error("Invalid Merkle proof item");
    }
    builder = builder.storeBit(side === "right").storeUint(normalizeUint256Hex(hash), 256);
  }
  return builder.endCell();
}

export function createDepositPositionId() {
  return Date.now().toString();
}

export function buildDepositTransferBody(input: {
  waveId: number;
  positionId: string;
  amountRaw: string;
  lockVaultAddress: string;
  responseAddress: string;
  forwardTon?: string;
}) {
  const forwardPayload = beginCell()
    .storeUint(input.waveId, 32)
    .storeUint(readUint64(input.positionId, "positionId"), 64)
    .endCell();
  return beginCell()
    .storeUint(JETTON_TRANSFER_OPCODE, 32)
    .storeUint(BigInt(Date.now()), 64)
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
}) {
  const batchId = String((input.proof as any).contract_batch_id || input.proof.batch_id);
  const ledgerIdHash = String((input.proof as any).ledger_id_hash || `0x${await sha256Hex(input.ledgerId)}`);
  const proofBoc = String((input.proof as any).proof_boc || "");
  const proofCell = proofBoc ? Cell.fromBase64(proofBoc) : encodeProofCell(input.proof.proof);
  return beginCell()
    .storeUint(CLAIM_REWARD_OPCODE, 32)
    .storeUint(BigInt(Date.now()), 64)
    .storeUint(readUint64(batchId, "batchId"), 64)
    .storeUint(normalizeUint256Hex(ledgerIdHash), 256)
    .storeAddress(Address.parse(input.recipientAddress))
    .storeCoins(readPositiveBigInt(input.proof.amount_raw, "amountRaw"))
    .storeRef(proofCell)
    .endCell()
    .toBoc()
    .toString("base64");
}

