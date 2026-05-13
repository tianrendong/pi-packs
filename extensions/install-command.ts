/**
 * pi-packs /install — interactive in-session installer for the bundled extensions.
 *
 * Registers a `/install` slash command that opens a multi-toggle dialog where
 * the user picks which of the umbrella's bundled extension packages to install,
 * then shells out to `pi install npm:<name>` for each selection. Scope (global
 * vs project-local) is chosen first.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface PackageEntry {
	name: string;
	description: string;
	conflicts?: string[];
}

interface InstalledPackage {
	source: string;
	scope: "global" | "local";
	settingsDir: string;
	packageName?: string;
}

const BUILTIN_CONFLICTS: Record<string, string[]> = {
	// pi-bar was renamed from trifecta-footer; both register the same footer/status UI.
	"pi-bar": ["trifecta-footer"],
	// tr-pi was the pre-rename umbrella and loaded bundled extensions directly.
	"pi-qq": ["tr-pi"],
	"pi-chrome": ["tr-pi"],
	"pi-linter": ["tr-pi"],
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPackages(): PackageEntry[] {
	const rootPkgPath = join(__dirname, "..", "package.json");
	let pkg: { dependencies?: Record<string, string>; "pi-packs"?: { installable?: Array<{ name?: string; description?: string; conflicts?: string[] }> }; "tr-pi"?: { installable?: Array<{ name?: string; description?: string; conflicts?: string[] }> } } = {};
	try {
		pkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
	} catch {
		return [];
	}
	// Preferred source: explicit `pi-packs.installable` array. This decouples "things /install
	// offers" from "things the umbrella depends on", so the umbrella can advertise installable
	// packages that aren't bundled or required at install time. Legacy `tr-pi.installable` key
	// is read as a fallback for installs lingering from before the pi-packs rename.
	const declared = pkg["pi-packs"]?.installable ?? pkg["tr-pi"]?.installable;
	if (Array.isArray(declared) && declared.length > 0) {
		return declared
			.filter((entry): entry is { name: string; description?: string } => typeof entry?.name === "string")
			.map((entry) => ({
				name: entry.name,
				description: entry.description || describePackage(entry.name) || "",
				conflicts: entry.conflicts,
			}));
	}
	// Fallback: derive from dependencies (legacy behavior).
	const names = Object.keys(pkg.dependencies ?? {});
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

function runPiCommand(
	args: string[],
): Promise<{ ok: boolean; output: string }> {
	return new Promise((resolve) => {
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

function runPiInstall(
	pkg: string,
	scope: "global" | "local",
): Promise<{ ok: boolean; output: string }> {
	const args = ["install"];
	if (scope === "local") args.push("-l");
	args.push(`npm:${pkg}`);
	return runPiCommand(args);
}

function runPiRemove(
	installed: InstalledPackage,
): Promise<{ ok: boolean; output: string }> {
	const args = ["remove"];
	if (installed.scope === "local") args.push("-l");
	args.push(installed.source);
	return runPiCommand(args);
}

function sourceOf(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry;
	if (entry && typeof entry === "object" && typeof (entry as { source?: unknown }).source === "string") {
		return (entry as { source: string }).source;
	}
	return undefined;
}

function npmPackageName(source: string): string | undefined {
	if (!source.startsWith("npm:")) return undefined;
	const spec = source.slice("npm:".length);
	if (!spec) return undefined;
	if (spec.startsWith("@")) {
		const slash = spec.indexOf("/");
		if (slash === -1) return spec;
		const versionAt = spec.indexOf("@", slash + 1);
		return versionAt === -1 ? spec : spec.slice(0, versionAt);
	}
	const versionAt = spec.indexOf("@");
	return versionAt === -1 ? spec : spec.slice(0, versionAt);
}

function localPackageName(source: string, settingsDir: string): string | undefined {
	if (source.startsWith("npm:") || source.startsWith("git:") || /^[a-z]+:\/\//i.test(source)) return undefined;
	const roots = isAbsolute(source)
		? [source]
		: [resolve(settingsDir, source), resolve(process.cwd(), source)];
	for (const absolute of roots) {
		if (!existsSync(absolute)) continue;
		const candidates = [join(absolute, "package.json"), join(dirname(absolute), "package.json")];
		for (const candidate of candidates) {
			try {
				const pkg = JSON.parse(readFileSync(candidate, "utf8"));
				if (typeof pkg.name === "string") return pkg.name;
			} catch {
				// try next candidate
			}
		}
	}
	// Best-effort fallback for deleted/moved local checkouts that still reveal the package name
	// in the configured path (for example `../pi-chrome`).
	return basename(source) || undefined;
}

function packageNameForSource(source: string, settingsDir: string): string | undefined {
	return npmPackageName(source) ?? localPackageName(source, settingsDir);
}

function readInstalledPackages(projectCwd: string): InstalledPackage[] {
	const scopes: Array<{ scope: "global" | "local"; settingsPath: string; settingsDir: string }> = [
		{ scope: "global", settingsPath: join(homedir(), ".pi", "agent", "settings.json"), settingsDir: join(homedir(), ".pi", "agent") },
		{ scope: "local", settingsPath: join(projectCwd, ".pi", "settings.json"), settingsDir: join(projectCwd, ".pi") },
	];
	const installed: InstalledPackage[] = [];
	for (const { scope, settingsPath, settingsDir } of scopes) {
		try {
			const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
			const packages = Array.isArray(settings.packages) ? settings.packages : [];
			for (const entry of packages) {
				const source = sourceOf(entry);
				if (!source) continue;
				installed.push({
					source,
					scope,
					settingsDir,
					packageName: packageNameForSource(source, settingsDir),
				});
			}
		} catch {
			// Missing or malformed settings should not block installation.
		}
	}
	return installed;
}

function conflictsFor(pkg: PackageEntry): Set<string> {
	return new Set([pkg.name, ...(BUILTIN_CONFLICTS[pkg.name] ?? []), ...(pkg.conflicts ?? [])]);
}

function findConflictingInstalls(pkg: PackageEntry, projectCwd: string): InstalledPackage[] {
	const conflictNames = conflictsFor(pkg);
	return readInstalledPackages(projectCwd).filter((installed) => {
		if (installed.source === "npm:pi-packs" || installed.packageName === "pi-packs") return false;
		return installed.packageName !== undefined && conflictNames.has(installed.packageName);
	});
}

export default function installCommandExtension(pi: ExtensionAPI): void {
	pi.registerCommand("install", {
		description: "Install bundled pi-packs extensions interactively",
		handler: async (_args, ctx) => {
			const packages = loadPackages();
			if (packages.length === 0) {
				ctx.ui.notify(
					"pi-packs: no installable packages discovered in package.json.",
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

			// Step 2: multi-toggle picker. Space toggles the highlighted package;
			// Enter confirms and starts installation; Esc cancels.
			const selection = new Map<string, boolean>();
			for (const p of packages) selection.set(p.name, true);

			const confirmed = await ctx.ui.custom<boolean>(
				(tui, theme, kb, done) => {
					let selectedIndex = 0;
					const maxVisible = Math.min(packages.length, 12);
					const move = (delta: number) => {
						selectedIndex = (selectedIndex + delta + packages.length) % packages.length;
					};
					const toggleSelected = () => {
						const pkg = packages[selectedIndex];
						if (pkg) selection.set(pkg.name, !selection.get(pkg.name));
					};
					const visiblePackages = () => {
						const start = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), packages.length - maxVisible));
						return { start, items: packages.slice(start, start + maxVisible) };
					};

					return {
						render: (width) => {
							const chosenCount = packages.filter((p) => selection.get(p.name)).length;
							const lines: string[] = [
								theme.fg("accent", theme.bold(`pi-packs installer — ${scope === "local" ? "project" : "global"} scope`)),
								theme.fg("dim", "All packages selected by default · Space toggles · Enter installs · Esc cancels"),
								"",
							];
							const { start, items } = visiblePackages();
							const nameWidth = Math.min(22, Math.max(...packages.map((p) => p.name.length)));
							for (let offset = 0; offset < items.length; offset++) {
								const index = start + offset;
								const pkg = items[offset];
								if (!pkg) continue;
								const selected = index === selectedIndex;
								const checked = selection.get(pkg.name) ? "● install" : "○ skip";
								const cursor = selected ? "➜" : " ";
								const label = `${cursor} ${pkg.name.padEnd(nameWidth)}  ${checked.padEnd(9)}  ${pkg.description ?? ""}`;
								lines.push(selected ? theme.fg("accent", label) : label);
							}
							if (packages.length > maxVisible) {
								lines.push(theme.fg("dim", `  (${selectedIndex + 1}/${packages.length})`));
							}
							lines.push("", theme.fg("dim", `Selected: ${chosenCount}. Press Enter to install.`));
							return lines.map((line) => line.length > width ? `${line.slice(0, Math.max(0, width - 1))}` : line);
						},
						invalidate: () => undefined,
						handleInput: (data) => {
							if (kb.matches(data, "tui.select.cancel") || data === "\u001b" || data === "\u0003") {
								done(false);
								return;
							}
							if (kb.matches(data, "tui.select.confirm") || data === "\r" || data === "\n") {
								done(true);
								return;
							}
							if (data === " " || data.toLowerCase() === "x") {
								toggleSelected();
								tui.requestRender();
								return;
							}
							if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.editor.cursorUp") || data === "\u001b[A" || data === "\u001bOA" || data.toLowerCase() === "k") {
								move(-1);
								tui.requestRender();
								return;
							}
							if (kb.matches(data, "tui.select.down") || kb.matches(data, "tui.editor.cursorDown") || data === "\u001b[B" || data === "\u001bOB" || data.toLowerCase() === "j") {
								move(1);
								tui.requestRender();
							}
						},
					};
				},
			);

			if (!confirmed) {
				ctx.ui.notify("Install cancelled.", "info");
				return;
			}

			const chosen = packages.filter((p) => selection.get(p.name));
			if (chosen.length === 0) {
				ctx.ui.notify("pi-packs: nothing selected.", "info");
				return;
			}

			ctx.ui.notify(
				`pi-packs: installing ${chosen.length} package(s) (${scope})…`,
				"info",
			);

			const failed: { name: string; output: string }[] = [];
			const installed: string[] = [];
			const overridden: string[] = [];
			const projectCwd = typeof ctx.cwd === "string" ? ctx.cwd : process.cwd();
			for (const p of chosen) {
				const conflicts = findConflictingInstalls(p, projectCwd);
				if (conflicts.length > 0) {
					ctx.ui.setStatus("pi-packs-install", `overriding ${p.name}…`);
					for (const conflict of conflicts) {
						const result = await runPiRemove(conflict);
						if (result.ok) {
							overridden.push(`${conflict.source} (${conflict.scope})`);
						} else {
							failed.push({
								name: `${p.name} override ${conflict.source}`,
								output: result.output,
							});
						}
					}
				}
				if (failed.some((f) => f.name.startsWith(`${p.name} override `))) continue;
				ctx.ui.setStatus("pi-packs-install", `installing ${p.name}…`);
				const result = await runPiInstall(p.name, scope);
				if (result.ok) {
					installed.push(p.name);
				} else {
					failed.push({ name: p.name, output: result.output });
				}
			}
			ctx.ui.setStatus("pi-packs-install", undefined);

			if (failed.length > 0) {
				const names = failed.map((f) => f.name).join(", ");
				ctx.ui.notify(`pi-packs: failed to install ${names}`, "error");
				for (const f of failed) {
					if (f.output) {
						// Surface details in the log; UI notify is single-line.
						console.error(`[pi-packs /install] ${f.name}:\n${f.output}`);
					}
				}
			}
			if (installed.length > 0) {
				const overrideSuffix = overridden.length > 0
					? ` Overrode ${overridden.length} existing install(s): ${overridden.join(", ")}.`
					: "";
				ctx.ui.notify(
					`pi-packs: installed ${installed.join(", ")}; reloading pi now.${overrideSuffix}`,
					"info",
				);
				await ctx.reload();
				return;
			}
		},
	});
}
