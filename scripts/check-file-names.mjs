import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname } from "node:path";

// These names are discovery protocols owned by Node, pnpm, and the skills installer.
const reserved = new Set([
  ".node-version",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "skills-lock.json",
]);

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const paths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
);

const directories = new Map();

const violations = [...new Set(paths.split("\0"))].filter((path) => {
  if (!path || !existsSync(path) || reserved.has(path)) return false;
  const directory = dirname(path);

  if (!directories.has(directory)) directories.set(directory, new Set(readdirSync(directory)));

  // Deleted index entries still resolve after a case-only rename on macOS. Check the real name.
  if (!directories.get(directory).has(basename(path))) return false;

  // Preserve the pinned third-party plugin, its upstream names, and required licenses.
  if (path.startsWith("tools/oxlint/anti-slop/")) return false;

  if (path.startsWith(".agents/skills/") && basename(path) === "SKILL.md") return false;

  return !kebabCase.test(basename(path).replace(/^\./, ""));
});

if (violations.length) {
  console.error(`Use kebab-case filenames:\n${violations.toSorted().join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("All project filenames use kebab-case (reserved tooling names preserved).");
}
