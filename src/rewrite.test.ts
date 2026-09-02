/**
 * Unit tests for pi-safe-rm rewrite logic.
 * Run: bun ./src/rewrite.test.ts
 */
import { rewriteRmCommand, rewriteSegment, splitCommand } from "./rewrite.ts";
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

console.log(`\n${passed} tests passed ✅`);
