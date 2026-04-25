import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const abiCopies = [
  {
    name: 'LockVault',
    source: 'build/LockVault/LockVault_LockVault.abi',
    target: 'server/src/services/contracts/abi/lock-vault/lock-vault.abi.json',
  },
  {
    name: 'MerkleClaim',
    source: 'build/MerkleClaim/MerkleClaim_MerkleClaim.abi',
    target: 'server/src/services/contracts/abi/merkle-claim/merkle-claim.abi.json',
  },
];

for (const copy of abiCopies) {
  const sourcePath = path.resolve(root, copy.source);
  const targetPath = path.resolve(root, copy.target);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${copy.name} ABI not found at ${copy.source}; run npm run contract:build first.`);
  }

  const raw = fs.readFileSync(sourcePath, 'utf8');
  JSON.parse(raw);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, raw.trimEnd());
  console.log(`Synced ${copy.name} ABI -> ${copy.target}`);
}
