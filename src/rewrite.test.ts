/**
 * Unit tests for pi-safe-rm rewrite logic.
 * Run: bun ./src/rewrite.test.ts
 */
import { isSystemTempPath, rewriteRmCommand, rewriteSegment, splitCommand } from "./rewrite.ts";
import assert from "node:assert/strict";

let passed = 0;
function t(name: string, input: string, expected: string | string[] | null) {
  const result =
    typeof expected === "string"
      ? rewriteRmCommand(input).rewritten
      : JSON.stringify(splitCommand(input));
  const want = typeof expected === "string" ? expected : JSON.stringify(expected);
  assert.equal(result, want, `FAIL: ${name}\n  in:  ${input}\n  got: ${result}\n  want: ${want}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("== 基础改写 ==");
t("单文件", "rm foo", "gio trash foo");
t("强制递归", "rm -rf dir", "gio trash --force dir");
t("组合短旗标", "rm -rfv dir", "gio trash --force dir");
t("多个文件", "rm -rf a b c", "gio trash --force a b c");
t("force 保留", "rm -f x", "gio trash --force x");
t("递归旗标同保留-f", "rm -rRf x", "gio trash --force x");
t("长旗标", "rm --recursive dir", "gio trash dir");
t("-- 结束选项", "rm -- -weird-file", "gio trash -weird-file");
t("引号路径", 'rm "path with spaces"', 'gio trash "path with spaces"');
t("绝对路径 rm", "/bin/rm -rf dir", "gio trash --force dir");
t("usr路径 rm", "/usr/bin/rm x", "gio trash x");

console.log("== command 前缀 ==");
t("command rm", "command rm -rf d", "gio trash --force d");
t("command -p rm", "command -p rm x", "gio trash x");
t("command -v 查询不改", "command -v rm", "command -v rm");
t("command -V 查询不改", "command -V rm", "command -V rm");

console.log("== 复合命令 ==");
t("&& 复合", "cd x && rm -rf dir", "cd x && gio trash --force dir");
t("管道", "rm -rf dir | head -n 5", "gio trash --force dir | head -n 5");
t("分号多段", "rm a; ls", "gio trash a; ls");
t("|| 复合", "false || rm -rf y", "false || gio trash --force y");

console.log("== 绕过与不改 ==");
t("SAFE_RM_USE_RM 绕过", "SAFE_RM_USE_RM=1 rm -rf x", "SAFE_RM_USE_RM=1 rm -rf x");
t("引号形式绕过", "SAFE_RM_USE_RM='1' rm -rf x", "SAFE_RM_USE_RM='1' rm -rf x");
t("非 rm 命令", "git status", "git status");
t("rm --help 无文件参数不改", "rm --help", "rm --help");
t("嵌套引号操作符已知局限", "rm 'a && b'", "gio trash 'a && b'");

console.log("== 系统临时目录直通（gio 拒收系统内部挂载）==");
t("/tmp 直通", "rm /tmp/x", "rm /tmp/x");
t("/tmp 递归直通（旗标原样保留）", "rm -rf /tmp/build", "rm -rf /tmp/build");
t("/var/tmp 直通", "rm /var/tmp/cache.tar", "rm /var/tmp/cache.tar");
t("/tmp 目录本身", "rm -rf /tmp", "rm -rf /tmp");
t("尾部斜杠直通", "rm -rf /tmp/x/", "rm -rf /tmp/x/");
t("-- 后仍直通", "rm -- /tmp/x", "rm -- /tmp/x");
t("引号路径直通", 'rm "/tmp/my file"', 'rm "/tmp/my file"');
t("command rm 直通", "command rm /tmp/x", "command rm /tmp/x");
t("前缀不误伤 /tmpfoo", "rm /tmpfoo", "gio trash /tmpfoo");
t(".. 穿越不直通", "rm /tmp/../etc/passwd", "gio trash /tmp/../etc/passwd");
t("相对路径不特判", "cd /tmp && rm x", "cd /tmp && gio trash x");
t("混合目标保守改写", "rm /tmp/a /home/b", "gio trash /tmp/a /home/b");

console.log("== isSystemTempPath 边界 ==");
assert.equal(isSystemTempPath("//tmp/x"), true, "双斜杠归一");
assert.equal(isSystemTempPath("/var/tmp"), true, "var/tmp 本身");
assert.equal(isSystemTempPath("tmp/x"), false, "相对路径");
assert.equal(isSystemTempPath("/tmp/.."), false, "归一化为根");
passed += 4;

console.log(`\n${passed} tests passed ✅`);
