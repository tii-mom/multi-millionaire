import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const i18nPath = resolve(root, "src/lib/i18n.tsx");
const source = await readFile(i18nPath, "utf8");

function sectionBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing section marker: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`Missing section end marker: ${endMarker}`);
  return text.slice(start + startMarker.length, end);
}

function extractKeys(section) {
  return new Set([...section.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]));
}

function findDuplicateKeys(section) {
  const seen = new Set();
  const duplicates = new Set();
  for (const match of section.matchAll(/^\s*"([^"]+)":/gm)) {
    if (seen.has(match[1])) duplicates.add(match[1]);
    seen.add(match[1]);
  }
  return [...duplicates].sort();
}

const enSection = sectionBetween(source, "  en: {", "\n  },\n  zh: {");
const zhSection = sectionBetween(source, "  zh: {", "\n  },\n};");
const enKeys = extractKeys(enSection);
const zhKeys = extractKeys(zhSection);
const duplicateEn = findDuplicateKeys(enSection);
const duplicateZh = findDuplicateKeys(zhSection);

const missingZh = [...enKeys].filter((key) => !zhKeys.has(key)).sort();
const missingEn = [...zhKeys].filter((key) => !enKeys.has(key)).sort();

if (missingZh.length || missingEn.length || duplicateEn.length || duplicateZh.length) {
  if (duplicateEn.length) {
    console.error("Duplicate en translation keys:");
    for (const key of duplicateEn) console.error(`  - ${key}`);
  }
  if (duplicateZh.length) {
    console.error("Duplicate zh translation keys:");
    for (const key of duplicateZh) console.error(`  - ${key}`);
  }
  if (missingZh.length) {
    console.error("Missing zh translations:");
    for (const key of missingZh) console.error(`  - ${key}`);
  }
  if (missingEn.length) {
    console.error("Missing en translations:");
    for (const key of missingEn) console.error(`  - ${key}`);
  }
  process.exitCode = 1;
} else {
  console.log(`i18n key parity passed: ${enKeys.size} keys in en/zh.`);
}

const filesToScan = [
  "src/App.tsx",
  "src/components",
  "src/views",
  "src/lib",
];

async function listFiles(path) {
  const { readdir, stat } = await import("node:fs/promises");
  const fullPath = resolve(root, path);
  const info = await stat(fullPath);
  if (info.isFile()) return [fullPath];
  const entries = await readdir(fullPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = resolve(fullPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(relative(root, child)));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes(".spec.")) {
      files.push(child);
    }
  }
  return files;
}

const hardcoded = [];
for (const scanTarget of filesToScan) {
  for (const file of await listFiles(scanTarget)) {
    if (file === i18nPath) continue;
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/[\u4e00-\u9fff]/.test(line)) {
        hardcoded.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

if (hardcoded.length) {
  console.warn("Potential hardcoded CJK UI text outside i18n:");
  for (const item of hardcoded) console.warn(`  ${item}`);
  process.exitCode = 1;
}
