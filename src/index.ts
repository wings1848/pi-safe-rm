/**
 * pi-safe-rm — Pi extension entry
 *
 * Rewrites Bash tool `rm` invocations to `gio trash` at tool_call time,
 * mirroring the classic safe-rm PreToolUse hook for Claude Code.
 *
 * Coexists with RTK: RTK rewrites git/cargo/pnpm-class commands, not `rm`
 * (verified: `rtk rewrite "rm -rf x"` exits non-zero with no output), so
 * these two handlers never fight over the same command.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { rewriteRmCommand } from "./rewrite.ts";

/** File used as an in-process indicator when gio was missing. */
function gioAvailable(): boolean {
  // Cheap PATH-aware check; PATH is stable within a session.
  const path = (process.env.PATH ?? "").split(":");
  return path.some((dir) => existsSync(join(dir || "/", "gio")));
}

export default function piSafeRmExtension(pi: ExtensionAPI): void {
  pi.on("tool_call", (event) => {
    if (event.toolName !== "bash") return {};
    const input = event.input;
    if (typeof input.command !== "string" || !input.command.trim()) return {};

    if (!gioAvailable()) {
      // No trash support on this system: leave the command alone rather
      // than silently breaking it. (gio ships with GLib on virtually all
      // desktops; users on bare servers can uninstall this extension.)
      return {};
    }

    const result = rewriteRmCommand(input.command);
    if (result.changed) {
      input.command = result.rewritten;
    }
    return {};
  });

  writeFileSync(
    join(homedir(), ".pi", "agent", "state", "pi-safe-rm-ok.txt"),
    `loaded ${new Date().toISOString()}\n`,
    { flag: "w" },
  );
}
