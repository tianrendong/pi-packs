/**
 * Dynamic-height bottom-slot overlay for /qq.
 *
 * Layout:
 *   banner (question summary)
 *   blank
 *   answer   — body wrapped at width-2
 *   blank
 *   footer   — key hints
 *
 * Keys:
 *   Esc → abort in-flight call + dismiss
 *   ↑/↓ → scroll when content exceeds terminal
 *
 * Used for both live /qq answers and view-only /qq-history.
 */

import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import type { OverlayOptions } from "@earendil-works/pi-tui";
import {
	type Component,
	Key,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

const QQ_OVERLAY_OPTIONS: OverlayOptions = {
	anchor: "bottom-center",
	width: "100%",
	maxHeight: "85%",
	margin: { left: 0, right: 0, bottom: 0 },
};

const QQ_MAX_HEIGHT_RATIO = 0.85;
const SIDE_PAD = "  ";
const ANSWER_PAD = "    ";
const QQ_LITERAL = "/qq";
const PENDING_GLYPH = "…";
const FOOTER_SCROLL = "↑/↓ to scroll";
const FOOTER_DISMISS = "Esc to dismiss";
const FOOTER_SEP = " · ";

type Mode = "pending" | "answer" | "error";

export interface ShowQqOverlayParams {
	ctx: ExtensionCommandContext;
	question: string;
	controller: AbortController;
	commandLabel?: string;
}

export interface ShowQqOverlayResult {
	overlayPromise: Promise<void>;
	controllerReady: Promise<QqOverlayController>;
}

export class QqOverlayController implements Component {
	private mode: Mode = "pending";
	private answer = "";
	private error = "";
	private scrollOffset = 0;

	constructor(
		private readonly question: string,
		private readonly theme: Theme,
		private readonly tui: TUI,
		private readonly done: (result?: undefined) => void,
		private readonly controller: AbortController,
		private readonly commandLabel: string = QQ_LITERAL,
	) {}

	setAnswer(text: string): void {
		this.mode = "answer";
		this.answer = text;
		this.tui.requestRender();
	}

	setError(message: string): void {
		this.mode = "error";
		this.error = message;
		this.tui.requestRender();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.controller.abort();
			this.done();
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.scrollOffset = this.scrollOffset + 1;
			this.tui.requestRender();
			return;
		}
	}

	render(width: number): string[] {
		const banner = this.renderBanner(width);
		const answerLines = this.renderAnswer(width);
		const footerAvail = Math.max(1, width - SIDE_PAD.length);
		const footerParts: string[] = [];
		if (this.mode !== "pending") footerParts.push(FOOTER_SCROLL);
		footerParts.push(FOOTER_DISMISS);
		const footer =
			SIDE_PAD + truncateToWidth(this.theme.fg("dim", footerParts.join(FOOTER_SEP)), footerAvail, "…", false);

		const natural: string[] = [banner, "", ...answerLines, "", footer];

		const termRows = (this.tui.terminal as { rows?: number }).rows ?? 24;
		const maxRows = Math.max(4, Math.floor(termRows * QQ_MAX_HEIGHT_RATIO));
		if (natural.length <= maxRows) {
			return natural;
		}
		const excess = natural.length - maxRows;
		if (this.scrollOffset > excess) this.scrollOffset = excess;
		const start = excess - this.scrollOffset;
		return natural.slice(start, start + maxRows);
	}

	invalidate(): void {
		// Render recomputes from state each cycle.
	}

	private renderBanner(width: number): string {
		const prefix = `${SIDE_PAD}${this.commandLabel} `;
		const prefixWidth = visibleWidth(prefix);
		const questionWidth = Math.max(0, width - prefixWidth);
		const truncatedQuestion = truncateToWidth(this.question, questionWidth, "…", false);
		const raw = prefix + truncatedQuestion;
		const padded = raw + " ".repeat(Math.max(0, width - visibleWidth(raw)));
		return this.theme.bg("customMessageBg", this.theme.fg("customMessageText", padded));
	}


	private renderAnswer(width: number): string[] {
		const bodyWidth = Math.max(1, width - ANSWER_PAD.length);
		const indent = (lines: string[]) => lines.map((line) => ANSWER_PAD + line);

		if (this.mode === "pending") {
			return indent([this.theme.fg("warning", PENDING_GLYPH)]);
		}
		if (this.mode === "error") {
			const out: string[] = [];
			for (const line of this.error.split("\n")) {
				const source = line.length === 0 ? " " : line;
				out.push(...wrapTextWithAnsi(this.theme.fg("error", source), bodyWidth));
			}
			return indent(out);
		}
		const out: string[] = [];
		for (const line of this.answer.split("\n")) {
			const source = line.length === 0 ? " " : line;
			out.push(...wrapTextWithAnsi(source, bodyWidth));
		}
		return indent(out);
	}
}

export function showQqOverlay(params: ShowQqOverlayParams): ShowQqOverlayResult {
	let resolveReady!: (controller: QqOverlayController) => void;
	const controllerReady = new Promise<QqOverlayController>((resolve) => {
		resolveReady = resolve;
	});

	const overlayPromise = params.ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			const controller = new QqOverlayController(
				params.question,
				theme,
				tui,
				done,
				params.controller,
				params.commandLabel,
			);
			resolveReady(controller);
			return controller;
		},
		{ overlay: true, overlayOptions: QQ_OVERLAY_OPTIONS },
	);

	return { overlayPromise, controllerReady };
}
