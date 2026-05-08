/**
 * /qq quick-question slash command.
 *
 * Asks the same primary model a one-off quick question using the cloned primary
 * conversation as read-only context. The answer is rendered ephemerally in a
 * bottom-slot overlay and never enters the main session transcript.
 *
 * Keeps in-memory, view-only answer history for /qq-history.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	type AssistantMessage,
	completeSimple,
	type Message,
	type StopReason,
	type UserMessage,
} from "@earendil-works/pi-ai";
import {
	buildSessionContext,
	convertToLlm,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { showQqOverlay } from "./qq-ui.js";

export const QQ_COMMAND_NAME = "qq";
export const QQ_HISTORY_COMMAND_NAME = "qq-history";
export const QQ_PREFIX = `/${QQ_COMMAND_NAME} `;
export const QQ_STATE_KEY = Symbol.for("pi-qq:qq");

const MSG_REQUIRES_INTERACTIVE = "/qq requires interactive mode";
const MSG_USAGE = "Usage: /qq [--recent|--full] <question>";
const MSG_NO_MODEL = "/qq requires an active model";
const ERR_EMPTY_RESPONSE = "/qq returned no text content.";
const MSG_NO_HISTORY = "No /qq history for this session yet";
const QQ_HISTORY_LIMIT = 20;
const RECENT_CONTEXT_MESSAGE_LIMIT = 12;
const FULL_CONTEXT_HEAD_MESSAGE_LIMIT = 4;
const FULL_CONTEXT_TAIL_MESSAGE_LIMIT = 80;
const MAX_TEXT_CHARS_PER_PART = 4_000;

const errMisconfigured = (label: string, err: string) => `/qq model (${label}) is misconfigured: ${err}`;
const errNoApiKey = (label: string) => `/qq model (${label}) has no API key available.`;
const errCallFailed = (err: string | undefined) => `/qq call failed: ${err ?? "unknown error"}`;
const errCallThrew = (msg: string) => `/qq call threw: ${msg}`;

export type QqContextMode = "recent" | "full";

interface ParsedQqArgs {
	question: string;
	mode: QqContextMode;
}

interface QqHistoryEntry {
	question: string;
	answer: string;
	timestamp: number;
}

interface QqState {
	histories: Map<string, QqHistoryEntry[]>;
}

export const QQ_SYSTEM_PROMPT = readFileSync(
	fileURLToPath(new URL("./prompts/qq-system.txt", import.meta.url)),
	"utf-8",
).trimEnd();

function getState(): QqState {
	const globalState = globalThis as unknown as { [k: symbol]: Partial<QqState> | undefined };
	let state = globalState[QQ_STATE_KEY];
	if (!state) {
		state = {};
		globalState[QQ_STATE_KEY] = state;
	}
	state.histories ??= new Map();
	return state as QqState;
}

function getSessionFile(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionFile() ?? `memory:${ctx.sessionManager.getSessionId()}`;
}

function getSessionHistory(ctx: ExtensionContext): QqHistoryEntry[] {
	const key = getSessionFile(ctx);
	const state = getState();
	let history = state.histories.get(key);
	if (!history) {
		history = [];
		state.histories.set(key, history);
	}
	return history;
}

function pushSessionHistory(ctx: ExtensionContext, entry: QqHistoryEntry): void {
	const history = getSessionHistory(ctx);
	history.push(entry);
	if (history.length > QQ_HISTORY_LIMIT) {
		history.splice(0, history.length - QQ_HISTORY_LIMIT);
	}
}

function formatHistoryTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatQqHistory(entries: QqHistoryEntry[]): string {
	return entries
		.slice()
		.reverse()
		.map((entry, index) => {
			const question = entry.question.replace(/\s+/g, " ").trim();
			const answer = entry.answer.trim();
			return `${index + 1}. ${formatHistoryTimestamp(entry.timestamp)} — /qq ${question}\n${answer}`;
		})
		.join("\n\n");
}

export function assistantMessageText(msg: AssistantMessage): string {
	return msg.content
		.filter((content): content is { type: "text"; text: string } => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}

function clipText(text: string): string {
	if (text.length <= MAX_TEXT_CHARS_PER_PART) return text;
	return `${text.slice(0, MAX_TEXT_CHARS_PER_PART)}\n[…truncated for /qq speed…]`;
}

function contentPartsToText(content: Array<{ type: string }>): string {
	const parts: string[] = [];
	for (const part of content) {
		if (part.type === "text" && "text" in part && typeof part.text === "string") {
			parts.push(clipText(part.text));
		} else if (part.type === "image") {
			parts.push("[image omitted for /qq speed]");
		} else if (part.type === "toolCall" && "name" in part && typeof part.name === "string") {
			parts.push(`[assistant requested tool: ${part.name}]`);
		}
	}
	return parts.join("\n").trim();
}

function userContentToText(content: UserMessage["content"]): string {
	return typeof content === "string" ? clipText(content) : contentPartsToText(content);
}

function trimMessageForContext(message: Message): Message {
	if (message.role === "assistant") {
		const text = contentPartsToText(message.content) || "[assistant message omitted for /qq speed]";
		return { ...message, content: [{ type: "text", text }] };
	}
	if (message.role === "user") {
		return { ...message, content: [{ type: "text", text: userContentToText(message.content) }] };
	}
	const text = contentPartsToText(message.content) || "[tool result omitted for /qq speed]";
	return {
		role: "user",
		content: [{ type: "text", text: `[tool result: ${message.toolName}]\n${text}` }],
		timestamp: message.timestamp,
	};
}

function selectRecentContextMessages(messages: Message[]): Message[] {
	return messages.slice(-RECENT_CONTEXT_MESSAGE_LIMIT).map(trimMessageForContext);
}

function selectFullContextMessages(messages: Message[]): Message[] {
	if (messages.length <= FULL_CONTEXT_HEAD_MESSAGE_LIMIT + FULL_CONTEXT_TAIL_MESSAGE_LIMIT) {
		return messages.map(trimMessageForContext);
	}
	return [
		...messages.slice(0, FULL_CONTEXT_HEAD_MESSAGE_LIMIT),
		...messages.slice(-FULL_CONTEXT_TAIL_MESSAGE_LIMIT),
	].map(trimMessageForContext);
}

function selectContextMessages(messages: Message[], mode: QqContextMode): Message[] {
	return mode === "full" ? selectFullContextMessages(messages) : selectRecentContextMessages(messages);
}

function parseQqArgs(args: string): ParsedQqArgs {
	const trimmed = args.trim();
	if (trimmed.startsWith("--recent ")) {
		return { mode: "recent", question: trimmed.slice("--recent ".length).trim() };
	}
	if (trimmed === "--recent") {
		return { mode: "recent", question: "" };
	}
	if (trimmed.startsWith("--full ")) {
		return { mode: "full", question: trimmed.slice("--full ".length).trim() };
	}
	if (trimmed === "--full") {
		return { mode: "full", question: "" };
	}
	return { mode: detectContextMode(trimmed), question: trimmed };
}

function includesAny(text: string, phrases: string[]): boolean {
	return phrases.some((phrase) => text.includes(phrase));
}

function detectContextMode(question: string): QqContextMode {
	const normalized = question.toLowerCase();

	const recentPhrases = [
		"last turn",
		"previous turn",
		"last message",
		"latest",
		"just now",
		"what did we just",
		"right now",
		"current",
		"currently",
		"most recent",
		"the last thing",
	];
	if (includesAny(normalized, recentPhrases)) {
		return "recent";
	}

	const fullPhrases = [
		"entire session",
		"whole session",
		"this session",
		"from the beginning",
		"full context",
		"so far",
		"overall",
		"earlier",
		"previously",
		"at the start",
		"originally",
		"what have we done",
		"what did we decide",
		"summarize",
		"recap",
	];
	if (includesAny(normalized, fullPhrases)) {
		return "full";
	}

	return "recent";
}

export interface QqExecResult {
	ok: boolean;
	answer?: string;
	userMessage?: UserMessage;
	assistantMessage?: AssistantMessage;
	error?: string;
	stopReason?: StopReason;
	aborted?: boolean;
}

function readCurrentContextMessages(ctx: ExtensionContext, mode: QqContextMode): Message[] {
	// Always rebuild the canonical LLM context from the session manager's live
	// leaf. This is important after /tree navigation: the session file remains an
	// append-only tree, so reading all entries (or a cached post-turn snapshot)
	// can accidentally include messages from descendants that are no longer on
	// the active branch.
	const sessionContext = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
	return selectContextMessages(convertToLlm(sessionContext.messages), mode);
}

export function buildQqMessages(ctx: ExtensionContext, userMessage: UserMessage, mode: QqContextMode): Message[] {
	return [...readCurrentContextMessages(ctx, mode), userMessage];
}

export async function executeQq(
	question: string,
	mode: QqContextMode,
	ctx: ExtensionContext,
	controller: AbortController,
): Promise<QqExecResult> {
	const model = ctx.model;
	if (!model) {
		return { ok: false, error: MSG_NO_MODEL };
	}
	const modelLabel = `${model.provider}:${model.id}`;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return { ok: false, error: errMisconfigured(modelLabel, auth.error) };
	}
	if (!auth.apiKey) {
		return { ok: false, error: errNoApiKey(modelLabel) };
	}

	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: question }],
		timestamp: Date.now(),
	};

	try {
		const response = await completeSimple(
			model,
			{ systemPrompt: QQ_SYSTEM_PROMPT, messages: buildQqMessages(ctx, userMessage, mode), tools: [] },
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				signal: controller.signal,
			},
		);

		if (response.stopReason === "aborted") {
			return { ok: false, aborted: true, stopReason: response.stopReason };
		}
		if (response.stopReason === "error") {
			return {
				ok: false,
				error: errCallFailed(response.errorMessage),
				stopReason: response.stopReason,
			};
		}

		const answerText = assistantMessageText(response).trim();
		if (!answerText) {
			return { ok: false, error: ERR_EMPTY_RESPONSE, stopReason: response.stopReason };
		}

		return {
			ok: true,
			answer: answerText,
			userMessage,
			assistantMessage: response,
			stopReason: response.stopReason,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (controller.signal.aborted) {
			return { ok: false, aborted: true };
		}
		return { ok: false, error: errCallThrew(message) };
	}
}

export function registerQqShortcut(pi: ExtensionAPI): void {
	pi.registerShortcut("alt+q", {
		description: "Toggle /qq quick-question prefix",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;
			const current = ctx.ui.getEditorText() ?? "";
			if (current.startsWith(QQ_PREFIX)) {
				ctx.ui.setEditorText(current.slice(QQ_PREFIX.length));
				return;
			}
			ctx.ui.setEditorText(QQ_PREFIX + current);
		},
	});
}

export function registerQqCommand(pi: ExtensionAPI): void {
	pi.registerCommand(QQ_COMMAND_NAME, {
		description: "Ask a quick question without polluting the main conversation",
		handler: (args: string, ctx: ExtensionCommandContext) => handleQqCommand(args, ctx),
	});
	pi.registerCommand(QQ_HISTORY_COMMAND_NAME, {
		description: "Show recent /qq answers for this session",
		handler: (_args: string, ctx: ExtensionCommandContext) => handleQqHistoryCommand(ctx),
	});
}

async function handleQqCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(MSG_REQUIRES_INTERACTIVE, "error");
		return;
	}
	const parsedArgs = parseQqArgs(args);
	if (!parsedArgs.question) {
		ctx.ui.notify(MSG_USAGE, "warning");
		return;
	}
	if (!ctx.model) {
		ctx.ui.notify(MSG_NO_MODEL, "error");
		return;
	}

	const controller = new AbortController();
	const { overlayPromise, controllerReady } = showQqOverlay({
		ctx,
		question: parsedArgs.question,
		controller,
	});

	const overlayCtl = await controllerReady;
	const result = await executeQq(parsedArgs.question, parsedArgs.mode, ctx, controller);

	if (result.ok && result.answer) {
		pushSessionHistory(ctx, {
			question: parsedArgs.question,
			answer: result.answer,
			timestamp: Date.now(),
		});
		overlayCtl.setAnswer(result.answer);
	} else if (result.aborted) {
		// User Esc'd — overlay already dismissed via done(); no further action.
	} else if (result.error) {
		overlayCtl.setError(result.error);
	}

	await overlayPromise;
}

async function handleQqHistoryCommand(ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(MSG_REQUIRES_INTERACTIVE, "error");
		return;
	}
	const history = getSessionHistory(ctx);
	if (history.length === 0) {
		ctx.ui.notify(MSG_NO_HISTORY, "info");
		return;
	}

	const controller = new AbortController();
	const { overlayPromise, controllerReady } = showQqOverlay({
		ctx,
		question: `${history.length} recent answer${history.length === 1 ? "" : "s"}`,
		controller,
		commandLabel: "/qq-history",
	});

	const overlayCtl = await controllerReady;
	overlayCtl.setAnswer(formatQqHistory(history));
	await overlayPromise;
}
