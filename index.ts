/**
 * Gates Node package manager commands in bash tool calls: a command using a
 * different manager than the repo's lockfile declares asks the user first.
 * Runners that never touch the repo (npx, bunx, dlx, npm exec) are exempt.
 */
import { existsSync } from "node:fs";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const LOCKFILES: Array<{ file: string; pm: string }> = [
	{ file: "yarn.lock", pm: "yarn" },
	{ file: "pnpm-lock.yaml", pm: "pnpm" },
	{ file: "bun.lockb", pm: "bun" },
	{ file: "bun.lock", pm: "bun" },
	{ file: "package-lock.json", pm: "npm" },
];

export const MANAGER_FAMILY: Record<string, string> = {
	yarn: "yarn",
	npm: "npm",
	pnpm: "pnpm",
	bun: "bun",
};

export const EXEMPT_RUNNERS = new Set(["npx", "bunx"]);

export function repoPackageManager(cwd: string): string | undefined {
	// Walk up from cwd to the filesystem root; the first lockfile wins.
	// Beyond the git root is ignored when .git exists, to avoid picking up a
	// lockfile from an enclosing non-repo directory.
	const segments = cwd.split("/");
	for (let i = segments.length; i > 0; i--) {
		const dir = segments.slice(0, i).join("/") || "/";
		for (const { file, pm } of LOCKFILES) {
			if (existsSync(`${dir}/${file}`)) return pm;
		}
		if (existsSync(`${dir}/.git`)) return undefined;
	}
	return undefined;
}

// Split a command chain into subcommands, respecting quotes so quoted text
// mentioning a manager never trips the gate.
export function subcommands(command: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | undefined;
	for (const char of command) {
		if (quote) {
			current += char;
			if (char === quote) quote = undefined;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}
		if (char === "&" || char === "|" || char === ";" || char === "\n") {
			if (current.trim()) parts.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

export function managerFamilyOf(subcommand: string): string | undefined {
	let cmd = subcommand.trim();
	while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd)) {
		// A spaceless `VAR=value` remainder means the whole subcommand is a bare
		// assignment: nothing left to gate, and slicing on indexOf -1 would loop forever.
		const space = cmd.indexOf(" ");
		if (space === -1) break;
		cmd = cmd.slice(space + 1);
	}
	const tokens = cmd.split(/\s+/);
	const manager = tokens[0];
	if (!manager) return undefined;
	if (EXEMPT_RUNNERS.has(manager)) return undefined;
	const family = MANAGER_FAMILY[manager];
	if (!family) return undefined;
	if ((family === "yarn" || family === "pnpm") && tokens[1] === "dlx") return undefined;
	if (family === "npm" && tokens[1] === "exec") return undefined;
	return family;
}

export default function (pi: ExtensionAPI) {
	let repoPm: string | undefined | null = null; // null = not resolved yet
	const sessionApproved = new Set<string>();

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;
		const command = event.input.command;
		if (!command) return;

		if (repoPm === null) repoPm = repoPackageManager(ctx.cwd);
		if (!repoPm) return;

		const wrong = subcommands(command)
			.map(managerFamilyOf)
			.find((family) => family !== undefined && family !== repoPm);
		if (!wrong) return;

		if (sessionApproved.has(wrong)) return;

		const options = [
			"Yes, allow once",
			"Yes, allow for this session",
			`No, use ${repoPm} instead`,
			"No, with a reason",
			"Stop",
		];
		const choice = await ctx.ui.select(
			`This repo uses ${repoPm} (lockfile) but the command uses ${wrong}. Allow?`,
			options,
		);

		if (choice === options[0]) return;
		if (choice === options[1]) {
			sessionApproved.add(wrong);
			return;
		}
		if (choice === options[2]) {
			return {
				block: true,
				reason: `This repo uses ${repoPm} (per its lockfile); rerun with ${repoPm}`,
			};
		}
		if (choice === options[3]) {
			const reason = await ctx.ui.input("Reason (sent back to the agent)");
			return { block: true, reason: reason || `Use ${repoPm} in this repo` };
		}
		if (choice === options[4]) {
			return { block: true, reason: `Wrong package manager (${wrong}); this repo uses ${repoPm}`, terminate: true };
		}
		return { block: true, reason: `Use ${repoPm} in this repo` };
	});
}
