#!/usr/bin/env node
/**
 * Cross-platform preinstall check (replaces the bash `sh -c '...'` snippet).
 * Removes stray lockfiles from other package managers and enforces pnpm usage.
 */
import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Remove package-lock.json / yarn.lock if present (created by npm/yarn by mistake)
for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  const fullPath = resolve(process.cwd(), lockfile);
  if (existsSync(fullPath)) {
    rmSync(fullPath, { force: true });
  }
}

// Ensure pnpm is the package manager being used
const agent = process.env["npm_config_user_agent"] ?? "";
if (!agent.startsWith("pnpm/")) {
  process.stderr.write(
    "Error: Use pnpm instead of npm or yarn to install dependencies.\n" +
      "  Install pnpm: https://pnpm.io/installation\n"
  );
  process.exit(1);
}
