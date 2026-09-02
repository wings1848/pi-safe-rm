# pi-safe-rm — Agent 协作约定

## 项目性质

pi 扩展插件（npm 包，GitHub=wings1848，npm=wingsbutterfly，两者账号不同）。

## 开发规范（repo-workflow）

- 改 `src/` 后必须跑：`bun ./src/rewrite.test.ts && bun ./src/coexistence.test.ts`（34 用例）+ `bunx tsc -p tsconfig.json --noEmit`
- 修改命令改写逻辑时保持 **fail-open**：解析不了就原样放行，绝不破坏命令
- 与 RTK 共存：只处理 rm 段；`rtk`/`gio` 段守卫不可移除（见 coexistence.test.ts）
- 主分支受保护：一律 分支 → PR → CI 绿（secrets scan）→ squash 合并
- 发布：`git tag v<VERSION> && git push origin --tags`（CI OIDC 自动发布，禁手动）

## 技术决策（防回归）

| 决策 | 原因 |
| --- | --- |
| `gio trash` 而非 `rm`+alias | 系统回收站标准做法，agent 命令可恢复 |
| tool_call 事件 hook | pi 无 Claude PreToolUse 协议；RTK 同款挂点，互不干扰 |
| try/catch fail-open | pi runner 不捕获扩展异常，泄漏会炸整个工具链 |
| SAFE_RM_USE_RM=1 逃生舱 | 需要真删时的一等公民路径 |
