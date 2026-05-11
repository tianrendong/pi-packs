/**
 * tr-pi /install — interactive in-session installer for the bundled extensions.
 *
 * Registers a `/install` slash command that opens a multi-toggle dialog where
 * the user picks which of the umbrella's bundled extension packages to install,
 * then shells out to `pi install npm:<name>` for each selection. Scope (global
 * vs project-local) is chosen first.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
	Container,
	type SettingItem,
	SettingsList,
	Text,
} from "@earendil-works/pi-tui";

interface PackageEntry {
	name: string;
	description: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPackages(): PackageEntry[] {
	const rootPkgPath = join(__dirname, "..", "package.json");
	let deps: Record<string, string> = {};
	try {
		const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
		deps = rootPkg.dependencies ?? {};
	} catch {
		return [];
	}
	const names = Object.keys(deps);
	return names.map((name) => ({ name, description: describePackage(name) }));
}

function describePackage(name: string): string {
	const candidates = [
		join(__dirname, "..", "node_modules", name, "package.json"),
		join(__dirname, "..", "packages", name, "package.json"),
	];
	for (const p of candidates) {
		try {
			const pkg = JSON.parse(readFileSync(p, "utf8"));
			if (typeof pkg.description === "string") return pkg.description;
		} catch {
			// ignore
		}
	}
	return "";
}

function runPiInstall(
	pkg: string,
	scope: "global" | "local",
): Promise<{ ok: boolean; output: string }> {
	return new Promise((resolve) => {
		const args = ["install"];
		if (scope === "local") args.push("-l");
		args.push(`npm:${pkg}`);

		const child = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr?.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("error", (err) => {
			resolve({ ok: false, output: `${err.message}` });
		});
		child.on("close", (code) => {
			const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
			resolve({ ok: code === 0, output });
		});
	});
}

export default function installCommandExtension(pi: ExtensionAPI): void {
	pi.registerCommand("install", {
		description: "Install bundled tr-pi extensions interactively",
		handler: async (_args, ctx) => {
			const packages = loadPackages();
			if (packages.length === 0) {
				ctx.ui.notify(
					"tr-pi: no bundled packages discovered in package.json.",
					"error",
				);
				return;
			}

			// Step 1: choose scope.
			const scopeChoice = await ctx.ui.select(
				"Install scope",
				[
					"Global (~/.pi/agent/settings.json)",
					"Project (.pi/settings.json)",
					"Cancel",
				],
			);
			if (!scopeChoice || scopeChoice.startsWith("Cancel")) {
				ctx.ui.notify("Install cancelled.", "info");
				return;
			}
			const scope: "global" | "local" = scopeChoice.startsWith("Project")
				? "local"
				: "global";

			// Step 2: multi-toggle picker via SettingsList.
			const selection = new Map<string, boolean>();
			for (const p of packages) selection.set(p.name, false);

			const confirmed = await ctx.ui.custom<boolean>(
				(_tui, theme, _kb, done) => {
					const items: SettingItem[] = packages.map((p) => ({
						id: p.name,
						label: p.description ? `${p.name} — ${p.description}` : p.name,
						currentValue: selection.get(p.name) ? "install" : "skip",
						values: ["install", "skip"],
					}));

					const container = new Container();
					container.addChild(
						new Text(
							theme.fg(
								"accent",
								theme.bold(
									`tr-pi installer — ${scope === "local" ? "project" : "global"} scope`,
								),
							),
							1,
							1,
						),
					);
					container.addChild(
						new Text(
							theme.fg(
								"dim",
								"toggle each package, then press Enter/Esc to apply",
							),
							1,
							1,
						),
					);

					const list = new SettingsList(
						items,
						Math.min(items.length + 2, 15),
						getSettingsListTheme(),
						(id, newValue) => {
							selection.set(id, newValue === "install");
						},
						() => done(true),
						{ enableSearch: false },
					);
					container.addChild(list);

					return {
						render: (w) => container.render(w),
						invalidate: () => container.invalidate(),
						handleInput: (data) => list.handleInput?.(data),
					};
				},
			);

			if (!confirmed) {
				ctx.ui.notify("Install cancelled.", "info");
				return;
			}

			const chosen = packages.filter((p) => selection.get(p.name));
			if (chosen.length === 0) {
				ctx.ui.notify("tr-pi: nothing selected.", "info");
				return;
			}

			ctx.ui.notify(
				`tr-pi: installing ${chosen.length} package(s) (${scope})…`,
				"info",
			);

			const failed: { name: string; output: string }[] = [];
			const installed: string[] = [];
			for (const p of chosen) {
				ctx.ui.setStatus("tr-pi-install", `installing ${p.name}…`);
				const result = await runPiInstall(p.name, scope);
				if (result.ok) {
					installed.push(p.name);
				} else {
					failed.push({ name: p.name, output: result.output });
				}
			}
			ctx.ui.setStatus("tr-pi-install", undefined);

			if (installed.length > 0) {
				ctx.ui.notify(
					`tr-pi: installed ${installed.join(", ")}. Restart pi to load.`,
					"info",
				);
			}
			if (failed.length > 0) {
				const names = failed.map((f) => f.name).join(", ");
				ctx.ui.notify(`tr-pi: failed to install ${names}`, "error");
				for (const f of failed) {
					if (f.output) {
						// Surface details in the log; UI notify is single-line.
						console.error(`[tr-pi /install] ${f.name}:\n${f.output}`);
					}
				}
			}
		},
	});
}
