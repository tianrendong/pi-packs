/**
 * pi-qq — Pi extension entry point.
 *
 * Registers:
 * - /qq command for one-off quick questions against the active model
 * - alt+q shortcut that toggles a /qq prefix in the editor
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerQqCommand, registerQqShortcut } from "./qq.js";

export default function (pi: ExtensionAPI): void {
	registerQqCommand(pi);
	registerQqShortcut(pi);
}
