import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const json = args.includes("--json");

function runGitStatus() {
  return execFileSync("git", ["status", "--porcelain=v1"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function classify(path) {
  const releaseReadyPatterns = [
    /^docs\/ops\/prelaunch-readiness\.md$/,
    /^docs\/ops\/launch-blocker-register\.md$/,
    /^docs\/ops\/mainnet-canary-checklist\.md$/,
    /^docs\/ops\/restricted-gray-launch-runbook\.md$/,
    /^docs\/ops\/production-env-template\.md$/,
    /^docs\/deposit-streak-rules\.md$/,
    /^scripts\/auditReleaseScope\.mjs$/,
    /^scripts\/checkPrelaunchReadiness\.mjs$/,
    /^package\.json$/,
    /^server\/package\.json$/,
    /^\.env\.example$/,
    /^server\/\.env\.example$/,
    /^docs\/release-checklist\.md$/,
    /^docs\/production-launch-runbook\.md$/,
  ];
  const depositStreakPatterns = [
    /^server\/migrations\/007_deposit_streaks\.sql$/,
    /^server\/src\/controllers\/depositStreakController\.ts$/,
    /^server\/src\/models\/depositStreakModel\.ts$/,
    /^server\/src\/routes\/depositStreak\.ts$/,
    /^server\/test\/depositStreakModel\.test\.ts$/,
    /^src\/views\/home\/DepositStreakPanel\.tsx$/,
  ];
  const releaseReviewPatterns = [
    /^server\/src\//,
    /^server\/test\//,
    /^src\//,
    /^scripts\/checkNavigation\.mjs$/,
    /^AGENTS\.md$/,
    /^CLAUDE\.md$/,
    /^README\.md$/,
  ];

  if (releaseReadyPatterns.some((pattern) => pattern.test(path))) {
    return {
      bucket: "release_readiness",
      action: "keep_and_review",
      reason: "Launch gate, documentation, or environment example needed for restricted gray-launch readiness.",
    };
  }
  if (depositStreakPatterns.some((pattern) => pattern.test(path))) {
    return {
      bucket: "deposit_streak",
      action: "keep_and_review",
      reason: "Part of the approved 30-day deposit streak reward feature; must be reviewed with migration and Merkle rehearsal evidence.",
    };
  }
  if (releaseReviewPatterns.some((pattern) => pattern.test(path))) {
    return {
      bucket: "release_review_required",
      action: "review_before_release",
      reason: "Application behavior or test surface changed; include in release review before freezing.",
    };
  }
  return {
    bucket: "unknown",
    action: "decide_before_release",
    reason: "No release bucket matched; explicitly keep, defer, or remove before tagging.",
  };
}

function parseStatusLine(line) {
  const status = line.slice(0, 2);
  const rawPath = line.slice(2).trimStart();
  const renameParts = rawPath.split(" -> ");
  const path = renameParts[renameParts.length - 1];
  return { status, path };
}

const rows = runGitStatus()
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(parseStatusLine)
  .map((entry) => ({ ...entry, ...classify(entry.path) }));

const buckets = rows.reduce((acc, row) => {
  acc[row.bucket] = (acc[row.bucket] || 0) + 1;
  return acc;
}, {});
const unknown = rows.filter((row) => row.bucket === "unknown");
const reviewRequired = rows.filter((row) => row.action !== "keep_and_review");

const report = {
  status: rows.length === 0 ? "clean" : unknown.length === 0 ? "review_required" : "needs_triage",
  changed_path_count: rows.length,
  buckets,
  release_freeze_required: rows.length > 0,
  unknown_path_count: unknown.length,
  review_required_count: reviewRequired.length,
  mutation_guard: "read-only git status classification; does not stage, commit, revert, or edit files",
  rows,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Release scope audit: ${report.status}`);
  console.log(`Changed paths: ${report.changed_path_count}`);
  console.log(`Unknown paths: ${report.unknown_path_count}`);
  console.log(`Review required paths: ${report.review_required_count}`);
  console.log(`Mutation guard: ${report.mutation_guard}`);
  console.log("\nBuckets:");
  for (const [bucket, count] of Object.entries(buckets)) {
    console.log(`- ${bucket}: ${count}`);
  }
  if (rows.length > 0) {
    console.log("\nChanged paths:");
    for (const row of rows) {
      console.log(`- ${row.status} ${row.path} [${row.bucket}] ${row.action}`);
    }
  }
}

process.exitCode = unknown.length > 0 ? 1 : 0;
