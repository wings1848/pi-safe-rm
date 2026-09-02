/**
 * pi-safe-rm — Pi extension entry
 *
 * Rewrites Bash tool `rm` invocations to `gio trash` at tool_call time,
 * mirroring the classic safe-rm PreToolUse hook for Claude Code.
 *
 * Isolation guarantees (works with or without RTK installed):
 * - Zero runtime dependency on RTK: only `tool_call` events are consumed,
 *   only `rm` segments are touched. RTK rewrites git/cargo/ls-class
 *   segments — disjoint, both orders converge (see coexistence tests).
 * - Any internal error is swallowed (fail-open): pi's runner does NOT
 *   catch handler exceptions, so this extension must never let one escape
 *   or it would break the whole tool_call chain for other extensions.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rewriteRmCommand } from "./rewrite.ts";

/** Cheap PATH-aware check; PATH is stable within a session. */
function gioAvailable(): boolean {
  const path = (process.env.PATH ?? "").split(":");
  return path.some((dir) => existsSync(join(dir || "/", "gio")));
}

export default function piSafeRmExtension(pi: ExtensionAPI): void {
  pi.on("tool_call", (event) => {
    try {
      if (event.toolName !== "bash") return {};
      const input = event.input;
      if (typeof input.command !== "string" || !input.command.trim()) return {};

      if (!gioAvailable()) {
        // No trash support (bare server, minimal container): leave the
        // command as-is rather than silently breaking it.
        return {};
      }

      const result = rewriteRmCommand(input.command);
      if (result.changed) {
        input.command = result.rewritten;
      }
    } catch (err) {
      // Fail-open: never let an internal bug break the tool_call chain
      // (pi's runner does not catch extension handler exceptions).
      console.error("[pi-safe-rm] rewrite skipped due to error:", err);
    }
    return {};
  });
}
