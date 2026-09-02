/**
 * core rewrite logic for pi-safe-rm
 *
 * Rewrites `rm` invocations to `gio trash` (system recycle bin) so that
 * commands executed by the coding agent are recoverable.
 *
 * Design notes:
 * - Pure functions, no Pi imports — unit-testable with bun.
 * - Segment-aware: handles `cmd1 && rm x | cmd3` style compound commands.
 * - Conservative: if a segment cannot be reliably parsed, it is left
 *   unchanged (fail-open), never mangled.
 * - Escape hatch: a segment whose first token is `SAFE_RM_USE_RM=1`
 *   (or `SAFE_RM_USE_RM='1'`) is left unchanged.
 */

export interface RewriteResult {
  changed: boolean;
  rewritten: string;
  /** human-readable reason for unchanged results (only when inspected) */
  reason?: string;
}

/** Tokens that gio trash does not understand and rm uses for recursion/verbose. */
const DROP_FLAGS = new Set([
  "-r",
  "-R",
  "--recursive",
  "--force-recursive",
  "-v",
  "--verbose",
  "-i",
  "--interactive",
  "-I",
  "--interactive=always",
  "--interactive=never",
  "--interactive=once",
  "-d",
  "--dir",
  "--no-preserve-root",
  "--one-file-system",
]);

const FORCE_FLAGS = new Set(["-f", "--force"]);

/**
 * Split a compound command on shell operators, preserving the operators.
 * `a && b | c; d` → ["a", "&&", "b", "|", "c", ";", "d"]
 */
export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let i = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const n = command.length;

  const push = (op?: string) => {
    const t = current.trim();
    if (t) parts.push(t);
    if (op) parts.push(op);
    current = "";
  };

  while (i < n) {
    const ch = command[i];
    if (escaped) {
      current += ch;
      escaped = false;
      i++;
      continue;
    }
    if (ch === "\\") {
      current += ch;
      escaped = true;
      i++;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      i++;
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      push("&&");
      i += 2;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      push("||");
      i += 2;
      continue;
    }
    if (ch === "|") {
      push("|");
      i++;
      continue;
    }
    if (ch === ";") {
      push(";");
      i++;
      continue;
    }
    if (ch === "\n") {
      push();
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  push();
  return parts;
}

/** Minimal shell-ish tokenizer for a command segment (quotes & escapes). */
export function tokenizeSegment(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const ch of segment) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Detect the escape hatch flag as the segment's first token. */
function isEscapeHatch(tokens: string[]): boolean {
  const first = tokens[0];
  return first === "SAFE_RM_USE_RM=1" || first === "SAFE_RM_USE_RM='1'";
}

/** Normalize the leading command word; returns null when not an rm invocation. */
function parseRmCommand(tokens: string[]): { kind: "rm" } | { kind: "query" } | { kind: "other" } {
  if (tokens.length === 0) return { kind: "other" };
  const first = tokens[0];
  // `command -v rm` / `command -V rm` are queries, not invocations.
  if (first === "command") {
    if ((tokens[1] === "-v" || tokens[1] === "-V" || tokens[1] === "--version") && tokens[2] === "rm") {
      return { kind: "query" };
    }
    if ((tokens[1] === "-p") && tokens[2] === "rm") return { kind: "rm" };
    if (tokens[1] === "rm") return { kind: "rm" };
    return { kind: "other" };
  }
  // /bin/rm, /usr/bin/rm, /usr/local/bin/rm
  if (first === "rm") return { kind: "rm" };
  if (/^(?:\/usr\/bin|\/bin|\/usr\/local\/bin|\/usr\/sbin)\/rm$/.test(first)) return { kind: "rm" };
  return { kind: "other" };
}

/**
 * Rewrite one command segment if it is an rm invocation.
 * Returns the transformed segment or null when not applicable.
 */
export function rewriteSegment(segment: string): string | null {
  const tokens = tokenizeSegment(segment);
  if (tokens.length === 0) return null;
  if (isEscapeHatch(tokens)) return null;

  // RTK 协作守卫（实测数据：rtk rewrite "rm a; ls" → "rm a; rtk ls"）：
  // - `rtk ...` 包装段是 RTK 的产物，绝不改动（防止未来 RTK 行为变化）
  // - `gio ...` 段已是本扩展的产物，幂等跳过（防止二次改写）
  if (tokens[0] === "rtk" || tokens[0] === "gio" || tokens[0] === "gio-thrash") return null;

  const parsed = parseRmCommand(tokens);
  if (parsed.kind === "query") return null;
  if (parsed.kind === "other") return null;

  // 去掉命令前缀：`rm` / `/bin/rm` / `command rm` / `command -p rm`
  let rest: string[];
  if (tokens[0] === "command" && tokens[1] === "rm") {
    rest = tokens.slice(2);
  } else if (tokens[0] === "command" && tokens[1] === "-p" && tokens[2] === "rm") {
    rest = tokens.slice(3);
  } else {
    rest = tokens.slice(1);
  }

  const trashArgs: string[] = [];
  let sawForce = false;
  let endOfOptions = false;
  for (const tok of rest) {
    if (!endOfOptions && tok === "--") {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && tok.startsWith("-") && tok !== "-" && tok.length > 1) {
      // split combined short flags like -rfv
      if (/^-[a-zA-Z]+$/.test(tok) && !tok.startsWith("--")) {
        for (const f of tok.slice(1)) {
          const full = `-${f}`;
          if (FORCE_FLAGS.has(full)) sawForce = true;
        }
        continue; // recursive/verbose/etc. dropped
      }
      if (FORCE_FLAGS.has(tok)) {
        sawForce = true;
        continue;
      }
      if (DROP_FLAGS.has(tok)) continue;
      // unknown flag — conservative: drop it too (gio won't accept rm flags)
      continue;
    }
    trashArgs.push(tok);
  }

  const files = trashArgs.filter((f) => f !== "-");
  if (files.length === 0) {
    // `rm` with no file args is a no-op; leave unchanged (e.g. `rm --help`)
    return null;
  }

  const out = [`gio trash${sawForce ? " --force" : ""}`, ...files].join(" ");
  return out;
}

/** Public entry: rewrite an entire compound command string. */
export function rewriteRmCommand(command: string): RewriteResult {
  const parts = splitCommand(command);
  const out: string[] = [];
  let changed = false;
  for (const part of parts) {
    if (/^(&&|\|\||\||;)$/.test(part)) {
      out.push(part);
      continue;
    }
    const rewritten = rewriteSegment(part);
    if (rewritten !== null && rewritten !== part) {
      out.push(rewritten);
      changed = true;
    } else {
      out.push(part);
    }
  }
  if (!changed) return { changed: false, rewritten: command };
  // 规范连接符格式：`;` 前无空格后有空格，`&&` / `||` / `|` 保持常规间距
  const joined = out.join(" ").replace(/\s*;\s*/g, "; ").trim();
  return { changed: true, rewritten: joined };
}
