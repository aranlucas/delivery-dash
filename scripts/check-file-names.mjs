import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname } from "node:path";

// Preserve tooling entry points and the conventional root feature roadmap.
const reserved = new Set([
  "AGENTS.md",
  "ROADMAP.md",
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

/** @type {Map<string, Set<string>>} */
const directories = new Map();

const violations = [...new Set(paths.split("\0"))].filter((path) => {
  if (!path || !existsSync(path) || reserved.has(path)) {
    return false;
  }

  const directory = dirname(path);

  let names = directories.get(directory);

  if (!names) {
    names = new Set(readdirSync(directory));
    directories.set(directory, names);
  }

  // Deleted index entries still resolve after a case-only rename on macOS. Check the real name.
  if (!names.has(basename(path))) {
    return false;
  }

  if (path.startsWith(".agents/skills/") && basename(path) === "SKILL.md") {
    return false;
  }

  return !kebabCase.test(basename(path).replace(/^\./, ""));
});

if (violations.length) {
  process.stderr.write(`Use kebab-case filenames:\n${violations.toSorted().join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "All project filenames use kebab-case (reserved tooling names preserved).\n",
  );
}
