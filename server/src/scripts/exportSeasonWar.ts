import dotenv from 'dotenv';
import { exportSeasonWar } from '../services/seasonWarExporter';

dotenv.config();

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return null;
}

function requireArg(name: string): string {
  const value = readArg(name);
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function parseInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function parseIntegerList(value: string, name: string): number[] {
  const parsed = value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => parseInteger(item, name));
  if (parsed.length === 0) {
    throw new Error(`--${name} must include at least one id`);
  }
  return parsed;
}

async function main() {
  const seasonId = parseInteger(requireArg('season-id'), 'season-id');
  const successfulRoundCount = parseInteger(requireArg('successful-round-count'), 'successful-round-count');
  const successfulWaveIds = parseIntegerList(requireArg('successful-wave-ids'), 'successful-wave-ids');
  const outDir = requireArg('out');
  const openAt = readArg('open-at');

  const result = await exportSeasonWar({
    seasonId,
    successfulRoundCount,
    successfulWaveIds,
    outDir,
    chainId: readArg('chain-id') || undefined,
    tokenAddress: readArg('token-address') || undefined,
    seasonClaimAddress: readArg('season-claim-address') || undefined,
    openAt: openAt ? parseInteger(openAt, 'open-at') : undefined,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    outDir,
    root: result.manifest.root,
    totalAmountRaw: result.manifest.total_amount_raw,
    leafCount: (result.manifest.counts as { leaves: number }).leaves,
    evidenceHash: result.manifest.evidence_hash,
  }, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
