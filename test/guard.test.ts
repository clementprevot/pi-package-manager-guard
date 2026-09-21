import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { managerFamilyOf, repoPackageManager, subcommands } from "../index.ts";

function tmpRepo(lockfile?: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pmguard-"));
	mkdirSync(join(dir, ".git"), { recursive: true });
	if (lockfile) writeFileSync(join(dir, lockfile), "");
	return dir;
}

test("repoPackageManager detects the manager from the nearest lockfile", () => {
	assert.equal(repoPackageManager(tmpRepo("yarn.lock")), "yarn");
	assert.equal(repoPackageManager(tmpRepo("pnpm-lock.yaml")), "pnpm");
	assert.equal(repoPackageManager(tmpRepo("package-lock.json")), "npm");
	assert.equal(repoPackageManager(tmpRepo("bun.lockb")), "bun");
});

test("repoPackageManager returns undefined in a repo without a lockfile", () => {
	assert.equal(repoPackageManager(tmpRepo()), undefined);
});

test("repoPackageManager stops at the git root and ignores enclosing lockfiles", () => {
	const outer = mkdtempSync(join(tmpdir(), "pmguard-outer-"));
	writeFileSync(join(outer, "yarn.lock"), "");
	const inner = tmpRepo();
	const nested = join(outer, "nested-repo");
	mkdirSync(nested, { recursive: true });
	mkdirSync(join(nested, ".git"), { recursive: true });
	assert.equal(repoPackageManager(nested), undefined);
	assert.equal(repoPackageManager(outer), "yarn");
	rmSync(inner, { recursive: true, force: true });
	rmSync(outer, { recursive: true, force: true });
});

test("subcommands splits a chain on separators but not inside quotes", () => {
	assert.deepEqual(subcommands("yarn install && yarn build"), ["yarn install", "yarn build"]);
	assert.deepEqual(subcommands("echo 'yarn and npm'; npm test"), ["echo 'yarn and npm'", "npm test"]);
	assert.deepEqual(subcommands("yarn install | tee log.txt"), ["yarn install", "tee log.txt"]);
});

test("managerFamilyOf maps managers and skips exempt runners", () => {
	assert.equal(managerFamilyOf("npm install"), "npm");
	assert.equal(managerFamilyOf("yarn add left-pad"), "yarn");
	assert.equal(managerFamilyOf("pnpm install"), "pnpm");
	assert.equal(managerFamilyOf("bun install"), "bun");
	assert.equal(managerFamilyOf("npx prettier"), undefined);
	assert.equal(managerFamilyOf("yarn dlx prettier"), undefined);
	assert.equal(managerFamilyOf("npm exec prettier"), undefined);
	assert.equal(managerFamilyOf("git status"), undefined);
});

test("managerFamilyOf strips env prefixes", () => {
	assert.equal(managerFamilyOf("CI=1 npm install"), "npm");
	assert.equal(managerFamilyOf("FOO=bar"), undefined);
	assert.equal(managerFamilyOf("NODE_OPTIONS=--max-old-space-size=4096 npm run build"), "npm");
});
