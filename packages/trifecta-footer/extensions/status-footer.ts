/**
 * Trifecta footer extension.
 *
 * Replaces the built-in footer with three left-aligned segments:
 *   ◈ <model name> ❯ ✦ think:<level> ❯ ◷ <context% / window>
 *
 * Examples:
 *   ◈ claude-opus-4.7  ❯  ✦ think:med  ❯  ◷ 2.6% / 1.0M
 *
 * Re-renders on model change, thinking-level change, and after each
 * assistant turn so context usage stays current.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

type SegmentName = "model" | "thinking" | "context";
type IconPreset = "unicode" | "plain" | "emoji" | "nerdfont";

const DEFAULT_SEGMENTS: SegmentName[] = ["model", "thinking", "context"];
const DEFAULT_WARNING_THRESHOLD = 70;
const DEFAULT_ERROR_THRESHOLD = 90;

const ICON_PRESETS: Record<
	IconPreset,
	{ model: string; thinking: string; context: string; separator: string }
> = {
	unicode: { model: "◈", thinking: "✦", context: "◷", separator: "❯" },
	plain: { model: "model", thinking: "think", context: "ctx", separator: "|" },
	emoji: { model: "🤖", thinking: "✨", context: "🧭", separator: "›" },
	nerdfont: { model: "󰚩", thinking: "󰧑", context: "󰍛", separator: "" },
};

function formatTokens(n: number): string {
	if (n >= 1_000_000) {
		const value = n / 1_000_000;
		return value >= 10 ? `${Math.round(value)}M` : `${value.toFixed(1)}M`;
	}
	if (n >= 1_000) {
		const value = n / 1_000;
		return value >= 10 ? `${Math.round(value)}k` : `${value.toFixed(1)}k`;
	}
	return `${n}`;
}

function formatModelName(id: string | undefined): string {
	if (!id) return "no-model";
	const base = id.includes("/") ? (id.split("/").pop() ?? id) : id;
	return base.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

function thinkingColor(level: string): string {
	switch (level) {
		case "off":
			return "thinkingOff";
		case "minimal":
		case "min":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
		case "med":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
		case "extra-high":
			return "thinkingXhigh";
		default:
			return "thinkingText";
	}
}

function contextColor(
	percent: number | null | undefined,
	warningThreshold: number,
	errorThreshold: number,
): string {
	if (percent === null || percent === undefined) return "muted";
	if (percent >= errorThreshold) return "error";
	if (percent >= warningThreshold) return "warning";
	return "success";
}

function parseSegments(): SegmentName[] {
	const raw = process.env.PI_TRIFECTA_SHOW;
	if (!raw) return DEFAULT_SEGMENTS;

	const requested = raw
		.split(",")
		.map((segment) => segment.trim().toLowerCase())
		.filter((segment): segment is SegmentName =>
			["model", "thinking", "context"].includes(segment),
		);

	return requested.length > 0 ? requested : DEFAULT_SEGMENTS;
}

function parseThresholds(): { warningThreshold: number; errorThreshold: number } {
	const raw = process.env.PI_TRIFECTA_THRESHOLDS;
	if (!raw) {
		return {
			warningThreshold: DEFAULT_WARNING_THRESHOLD,
			errorThreshold: DEFAULT_ERROR_THRESHOLD,
		};
	}

	const [warning, error] = raw
		.split(",")
		.map((value) => Number.parseFloat(value.trim()));

	if (
		Number.isFinite(warning) &&
		Number.isFinite(error) &&
		warning >= 0 &&
		error > warning
	) {
		return { warningThreshold: warning, errorThreshold: error };
	}

	return {
		warningThreshold: DEFAULT_WARNING_THRESHOLD,
		errorThreshold: DEFAULT_ERROR_THRESHOLD,
	};
}

function parseIconPreset(): IconPreset {
	const raw = process.env.PI_TRIFECTA_ICONS?.trim().toLowerCase();
	if (raw === "plain" || raw === "emoji" || raw === "nerdfont") return raw;
	return "unicode";
}

function prefixed(icon: string, text: string, preset: IconPreset): string {
	if (preset === "plain") return `${icon}:${text}`;
	return `${icon} ${text}`;
}

export default function (pi: ExtensionAPI) {
	let requestRender: (() => void) | undefined;
	const refresh = () => requestRender?.();

	pi.on("model_select", async () => refresh());
	pi.on("thinking_level_select", async () => refresh());
	pi.on("turn_end", async () => refresh());
	pi.on("message_end", async () => refresh());

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		const visibleSegments = parseSegments();
		const iconPreset = parseIconPreset();
		const icons = ICON_PRESETS[iconPreset];
		const { warningThreshold, errorThreshold } = parseThresholds();

		ctx.ui.setFooter((tui, theme) => {
			requestRender = () => tui.requestRender();

			return {
				dispose() {
					requestRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const modelName = formatModelName(ctx.model?.id);
					const thinkingLevel = String(pi.getThinkingLevel());
					const usage = ctx.getContextUsage();
					const contextSegmentColor = contextColor(
						usage?.percent,
						warningThreshold,
						errorThreshold,
					);

					const contextText = usage
						? `${usage.percent !== null ? `${usage.percent.toFixed(1)}%` : "—%"} / ${formatTokens(usage.contextWindow)}`
						: "—";

					const segmentRenderers: Record<SegmentName, string> = {
						model: theme.fg(
							"accent",
							prefixed(icons.model, modelName, iconPreset),
						),
						thinking: theme.fg(
							thinkingColor(thinkingLevel),
							prefixed(icons.thinking, `think:${thinkingLevel}`, iconPreset),
						),
						context: theme.fg(
							contextSegmentColor,
							prefixed(icons.context, contextText, iconPreset),
						),
					};

					const separator = `  ${theme.fg("dim", icons.separator)}  `;
					const line = visibleSegments
						.map((segment) => segmentRenderers[segment])
						.join(separator);

					return [truncateToWidth(line, width)];
				},
			};
		});
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setFooter(undefined);
	});
}
