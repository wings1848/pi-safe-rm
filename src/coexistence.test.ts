/**
 * Coexistence tests with pi-rtk-optimizer (RTK).
 *
 * Model: RTK rewrites per-segment (git/cargo/ls-class commands → `rtk …`),
 * never `rm`; pi-safe-rm rewrites per-segment `rm` invocations, never
 * non-rm commands. Segments are disjoint → both handler orders converge to
 * the same result.
 *
 * Two layers:
 *  - Layer 1 (pure, always runs): simulate RTK's documented per-segment
 *    behavior with a local mock; assert both orderings converge.
 *  - Layer 2 (integration, only when `rtk` CLI exists): pipe segments
 *    through the real `rtk rewrite` binary and assert the same property.
 */
import { rewriteRmCommand } from "./rewrite.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// —— Layer 1: RTK mock（模拟 RTK 的逐段行为：ls|git|cargo 段 → rtk 前缀）——
const RTK_WRAPS = new Set(["ls", "git", "cargo", "grep", "find"]);
function rtkMock(command: string): string {
  return command
    .split(/(&&|\|\||\||;)/)
    .map((part) => {
      const p = part.trim();
      if (!p) return part;
      const first = p.split(" ")[0];
      if (RTK_WRAPS.has(first) && !p.startsWith("rtk ")) return `rtk ${p}`;
      return part;
    })
    .join(" ")
    .trim();
}

function normalizeForCompare(s: string): string {
  return s
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*&&\s*/g, " && ")
    .replace(/\s*\|\|\s*/g, " || ")
    .replace(/\s*\|\s+/g, " | ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function converge(name: string, input: string) {
  // order A: RTK first, then safe-rm
  const a = rewriteRmCommand(rtkMock(input)).rewritten;
  // order B: safe-rm first, then RTK
  const b = rtkMock(rewriteRmCommand(input).rewritten);
  assert.equal(normalizeForCompare(a), normalizeForCompare(b), `FAIL(收敛): ${name}\n A: ${a}\n B: ${b}`);
  console.log(`  ✓ 收敛: ${name} → ${a}`);
}

console.log("== 双顺序收敛（RTK 模拟）==");
converge("段拆分互补", "rm a; ls");
converge("管道组合", "rm -rf dir | head -n 5");
converge("&& 组合", "cd x && rm -rf y");
converge("RTK 域命令", "git status && rm t");
converge("纯净 rm", "rm -rf build");
converge("系统临时目录直通", "rm -rf /tmp/x");
converge("已 rtk 包装", "rm a; rtk ls");

console.log("== 幂等 ==");
{
  const once = rewriteRmCommand("rm -rf build").rewritten;
  const twice = rewriteRmCommand(once).rewritten;
  assert.equal(once, twice, "幂等失败");
  console.log(`  ✓ 幂等: ${once}`);
}

// —— Layer 2: 真实 rtk CLI（存在才跑）——
const rtkBin = ["/usr/bin/rtk", "/usr/local/bin/rtk", "/opt/homebrew/bin/rtk"].find((p) => existsSync(p))
  ?? (() => { try { execFileSync("which", ["rtk"]); return "rtk"; } catch { return null; } })();

if (rtkBin) {
  console.log("== 真实 rtk CLI 集成（双顺序收敛）==");
  const rtkReal = (command: string): string => {
    try {
      const out = execFileSync(rtkBin, ["rewrite", command], { encoding: "utf8" }).trim();
      return out || command;
    } catch {
      return command; // rtk: exit 2 = no rewrite
    }
  };
  for (const input of ["rm a; ls", "git status && rm t", "rm -rf /tmp/x", "cargo build; rm y"]) {
    const a = rewriteRmCommand(rtkReal(input)).rewritten;
    const b = rtkReal(rewriteRmCommand(input).rewritten);
    assert.equal(normalizeForCompare(a), normalizeForCompare(b), `FAIL(真实rtk 收敛): ${input}\n A: ${a}\n B: ${b}`);
    console.log(`  ✓ 收敛: ${input} → ${a}`);
  }
} else {
  console.log("(rtk CLI 不在 PATH，跳过真实集成层)");
}
