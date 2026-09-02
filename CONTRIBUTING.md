# Contributing

## 开发

```bash
bun install
bun ./src/rewrite.test.ts        # 改写逻辑单测
bun ./src/coexistence.test.ts    # RTK 共存收敛测试
bunx tsc -p tsconfig.json --noEmit   # 类型检查
```

## 提 PR 前检查

- [ ] 34 用例全绿 + typecheck 通过
- [ ] 新增行为有对应测试（纯函数：`src/rewrite.ts` 描述预期）
- [ ] 保持 fail-open：新解析路径不可靠时放行原命令
- [ ] README 的 Behavior 表同步更新
- [ ] CHANGELOG 添加条目（Unreleased / 新版本段）

## 发布流程

1. `git tag v<新版本> && git push origin --tags`
2. CI 自动：typecheck → tests → 密钥门禁 → OIDC 发布
3. main 受保护：所有改动走 PR + squash 合并

## 常见环境

- 本地：bun（测试）、bunx tsc（类型）、git（版本）
- CI（GitHub Actions）：node 24 + npm ≥11.5 + bun（测试执行）
