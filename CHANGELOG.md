# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-09-02

### Changed
- 系统临时目录直通：`rm` 目标全部位于 `/tmp`、`/var/tmp` 时不再改写 —— gio trash 对 GLib「系统内部挂载点」必然拒绝，改写只会把可执行的删除变成必失败；临时文件本身即用即弃，真删
- README 补充回收站空间语义：trash 是同盘 rename（不存在"放不下"），但空间要到清空回收站才释放

## [0.1.2] - 2026-09-02

### Fixed
- CI: setup-bun action 路径修正（`oven-sh/setup-bun`）

## [0.1.1] - 2026-09-02

### Fixed
- CI: OIDC 兼容（node 24 + npm ≥11.5）
- 扩展：handler 异常 fail-open 隔离

## [0.1.0] - 2026-09-02

### Added
- 首个版本：Bash `rm` → `gio trash` 安全改写
- tool_call 事件挂钩，与 RTK 逐段互补
- 24 个改写单测 + 10 个共存/收敛用例
- CI：typecheck + 34 tests + trufflehog 密钥门禁 + OIDC 发布 + Dependabot
