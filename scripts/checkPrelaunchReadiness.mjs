import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const json = args.includes("--json");
const allowDirty = args.includes("--allow-dirty");
const profileArg = args.find((arg) => !arg.startsWith("--"));
const profile = profileArg || "production";

function run(command, commandArgs, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, commandArgs, {
        cwd: options.cwd || rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      }),
      stderr: "",
      status: 0,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || "",
      status: typeof error.status === "number" ? error.status : 1,
    };
  }
}

function readJsonFromCommand(command, commandArgs, options = {}) {
  const result = run(command, commandArgs, options);
  try {
    return {
      ...result,
      json: result.stdout.trim() ? JSON.parse(result.stdout) : null,
    };
  } catch (error) {
    return {
      ...result,
      json: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function hasText(path, needle) {
  if (!existsSync(path)) return false;
  return readFileSync(path, "utf8").includes(needle);
}

function flattenEnvFailures(envReport) {
  if (!envReport?.json) return [];
  const required = Array.isArray(envReport.json.required) ? envReport.json.required : [];
  return required.filter((item) => item.status !== "present");
}

const blockers = [];
const warnings = [];
const passes = [];

const requiredFiles = [
  "CLAUDE.md",
  "README.md",
  "docs/release-checklist.md",
  "docs/production-launch-runbook.md",
  "docs/gray-launch-communications.md",
  "docs/ops/mainnet-canary-checklist.md",
  "docs/ops/launch-blocker-register.md",
  "docs/ops/production-env-template.md",
  "docs/ops/restricted-gray-launch-runbook.md",
  "server/migrations/007_deposit_streaks.sql",
];

for (const relativePath of requiredFiles) {
  const absolutePath = join(rootDir, relativePath);
  if (existsSync(absolutePath)) {
    passes.push(`Required readiness artifact exists: ${relativePath}`);
  } else {
    blockers.push(`Missing required readiness artifact: ${relativePath}`);
  }
}

const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const serverPackageJson = JSON.parse(readFileSync(join(rootDir, "server/package.json"), "utf8"));
const requiredRootScripts = [
  "lint",
  "build",
  "test",
  "test:nav",
  "test:i18n",
  "audit:release-scope",
  "cf:backend:check",
  "smoke:production-readonly",
  "smoke:production-gray-readonly",
];
const requiredServerScripts = [
  "build",
  "test",
  "check:env",
  "check:schema",
  "smoke:production-readonly",
  "smoke:production-gray-readonly",
  "smoke:production-canary",
];

for (const script of requiredRootScripts) {
  if (packageJson.scripts?.[script]) {
    passes.push(`Root script available: npm run ${script}`);
  } else {
    blockers.push(`Missing root script: npm run ${script}`);
  }
}

for (const script of requiredServerScripts) {
  if (serverPackageJson.scripts?.[script]) {
    passes.push(`Server script available: cd server && npm run ${script}`);
  } else {
    blockers.push(`Missing server script: cd server && npm run ${script}`);
  }
}

const gitStatus = run("git", ["status", "--porcelain"]);
if (!gitStatus.ok) {
  warnings.push(`Unable to inspect git status: ${gitStatus.stderr || gitStatus.stdout}`.trim());
} else {
  const changed = gitStatus.stdout.trim().split("\n").filter(Boolean);
  if (changed.length > 0 && !allowDirty) {
    blockers.push(`Working tree is not release-frozen: ${changed.length} changed/untracked path(s). Re-run with --allow-dirty only for local diagnosis.`);
  } else if (changed.length > 0) {
    warnings.push(`Working tree has ${changed.length} changed/untracked path(s); --allow-dirty was provided.`);
  } else {
    passes.push("Working tree is clean.");
  }
}

const releaseScopeReport = readJsonFromCommand("node", ["scripts/auditReleaseScope.mjs", "--json"]);
if (!releaseScopeReport.json) {
  blockers.push("Unable to parse release scope audit JSON output.");
  if (releaseScopeReport.stderr.trim()) warnings.push(releaseScopeReport.stderr.trim());
  if (releaseScopeReport.parseError) warnings.push(releaseScopeReport.parseError);
} else {
  if (releaseScopeReport.json.unknown_path_count > 0) {
    blockers.push(`Release scope has ${releaseScopeReport.json.unknown_path_count} unknown changed path(s) that must be triaged before release.`);
  } else if (releaseScopeReport.json.changed_path_count > 0) {
    warnings.push(`Release scope audit classified ${releaseScopeReport.json.changed_path_count} changed path(s); review and commit before tagging.`);
  } else {
    passes.push("Release scope audit is clean.");
  }
}

const tsNodeBin = process.platform === "win32" ? "ts-node.cmd" : "ts-node";
const envReport = readJsonFromCommand(join(rootDir, "server/node_modules/.bin", tsNodeBin), ["src/scripts/checkEnv.ts", profile, "--json"], {
  cwd: join(rootDir, "server"),
});
if (!envReport.json) {
  blockers.push(`Unable to parse ${profile} env check JSON output.`);
  if (envReport.stderr.trim()) warnings.push(envReport.stderr.trim());
  if (envReport.parseError) warnings.push(envReport.parseError);
} else {
  const envFailures = flattenEnvFailures(envReport);
  if (envFailures.length > 0) {
    for (const failure of envFailures) {
      blockers.push(`${profile} env gate failed: ${failure.name} is ${failure.status}${failure.message ? ` (${failure.message})` : ""}.`);
    }
  } else {
    passes.push(`${profile} required environment gates pass.`);
  }

  const recommended = Array.isArray(envReport.json.recommended) ? envReport.json.recommended : [];
  const missingRecommended = recommended.filter((item) => item.status !== "present");
  for (const item of missingRecommended) {
    warnings.push(`${profile} recommended env check: ${item.name} is ${item.status}${item.message ? ` (${item.message})` : ""}.`);
  }
}

const publicLaunchEnabled = isTruthy(process.env.PRODUCTION_PUBLIC_LAUNCH_ENABLED);
const chainWritesEnabled = isTruthy(process.env.CHAIN_MAINLINE_WRITES_ENABLED);
const productionCanaryApproved = isTruthy(process.env.PRODUCTION_CANARY_APPROVED);

if (publicLaunchEnabled && !isTruthy(process.env.ANTI_SYBIL_PUBLIC_LAUNCH_APPROVED)) {
  blockers.push("Public launch is enabled but ANTI_SYBIL_PUBLIC_LAUNCH_APPROVED is not true.");
}

if (chainWritesEnabled && !productionCanaryApproved) {
  blockers.push("CHAIN_MAINLINE_WRITES_ENABLED=true requires PRODUCTION_CANARY_APPROVED=true for the named canary window.");
}

if (!hasText(join(rootDir, "docs/gray-launch-communications.md"), "Do not say public production is live")) {
  blockers.push("Gray launch communication guardrail is missing the public-production prohibition.");
} else {
  passes.push("Gray launch communication guardrails include the public-production prohibition.");
}

if (!hasText(join(rootDir, "docs/release-checklist.md"), "007_deposit_streaks.sql")) {
  blockers.push("Release checklist does not include the deposit streak migration.");
} else {
  passes.push("Release checklist includes the deposit streak migration.");
}

if (!hasText(join(rootDir, "docs/ops/launch-blocker-register.md"), "ANTI_SYBIL_PUBLIC_LAUNCH_APPROVED")) {
  blockers.push("Launch blocker register does not include the anti-sybil public launch gate.");
} else {
  passes.push("Launch blocker register includes the anti-sybil public launch gate.");
}

if (!hasText(join(rootDir, "docs/ops/restricted-gray-launch-runbook.md"), "pause_deposit_streak_rewards")) {
  blockers.push("Restricted gray-launch runbook does not include deposit streak pause rehearsal.");
} else {
  passes.push("Restricted gray-launch runbook includes deposit streak pause rehearsal.");
}

const requiredVerification = [
  "npm run lint",
  "npm run build",
  "npm test",
  "npm run audit:release-scope",
  "cd server && npm run build",
  "cd server && npm test",
  "cd server && npm run check:schema",
  "npm run test:nav",
  "npm run test:i18n",
  "npm run cf:backend:check",
  "API_BASE_URL=$PRODUCTION_API_BASE_URL npm run smoke:production-readonly",
  "API_BASE_URL=$PRODUCTION_API_BASE_URL npm run smoke:production-gray-readonly",
];

const report = {
  status: blockers.length === 0 ? "pass" : "fail",
  profile,
  mutation_guard: "read-only repository and environment inspection; does not deploy, migrate, register, deposit, claim, publish rewards, or call production admin endpoints",
  release_classification: blockers.length === 0
    ? "Eligible for restricted gray-launch review; real-funds launch still requires explicit operator approval."
    : "Not ready for public production or real-funds operation.",
  blockers,
  warnings,
  passes,
  required_verification: requiredVerification,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Prelaunch readiness: ${report.status}`);
  console.log(`Profile: ${profile}`);
  console.log(`Release classification: ${report.release_classification}`);
  console.log(`Mutation guard: ${report.mutation_guard}`);

  if (blockers.length > 0) {
    console.log("\nBlockers:");
    for (const blocker of blockers) console.log(`- ${blocker}`);
  }

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  if (passes.length > 0) {
    console.log("\nPassed static checks:");
    for (const pass of passes) console.log(`- ${pass}`);
  }

  console.log("\nRequired verification before any release tag:");
  for (const command of requiredVerification) console.log(`- ${command}`);
}

process.exitCode = blockers.length === 0 ? 0 : 1;
