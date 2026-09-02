# pi-safe-rm

Pi extension: **rewrites Bash tool `rm` to `gio trash`** — agent-deleted files
land in the system recycle bin instead of being permanently erased.

> Port of the classic [Claude Code safe-rm PreToolUse hook](https://github.com/…)
> for Pi's extension architecture. Claude Code hooks are not compatible with
> Pi (Pi has no PreToolUse protocol); this extension uses Pi's native
> `tool_call` event instead, and coexists with RTK (which rewrites
> git/cargo/pnpm-class commands, never `rm`).

## Install

With the pi-plugins collection:

```bash
pi install git:https://github.com/wings1848/pi-safe-rm.git
```

Or add to `~/.pi/agent/settings.json`:

```json
"packages": [ "npm:pi-safe-rm" ]
```

## Behavior

| Command | Becomes |
| --- | --- |
| `rm file` | `gio trash file` |
| `rm -rf dir` | `gio trash --force dir` |
| `rm -rfv dir` | `gio trash --force dir` |
| `/bin/rm -rf dir` | `gio trash --force dir` |
| `command rm -rf dir` | `gio trash --force dir` |
| `cd x && rm -rf dir \| head` | `cd x && gio trash --force dir \| head` |
| `rm "path with spaces"` | `gio trash "path with spaces"` |
| `SAFE_RM_USE_RM=1 rm -rf x` | **unchanged** (bypass — delete for real) |
| `command -v rm` | unchanged (query, not invocation) |
| `git status` | unchanged |

Flags understood by `gio trash` (`-f`/`--force`) are preserved; rm-only flags
(`-r -R -v -i -d --recursive …`) are dropped.

## RTK coexistence（实测验证）

**有无 RTK 均可独立工作**：pi-safe-rm 对 RTK **零运行时依赖**（不 import、不调用），
只剩 `tool_call` 事件消费，且只在 `rm` 段上改写。

`rtk rewrite` 的实测行为：

```
rtk rewrite "rm -rf /tmp/x"  → rc=2, 无改写        （rtk 不碰 rm）
rtk rewrite "rm a; ls"       → rc=3, "rm a; rtk ls" （rtk 逐段只包 ls）
rtk rewrite "gio trash /tmp/x" → rc=1, 无改写      （rtk 不碰 gio）
```

结论：两个改写器是**逐段互补**的——RTK 管 git/cargo/ls 类段，safe-rm 管 rm 段，
交集为空；无论扩展加载顺序如何，最终结果收敛（`src/coexistence.test.ts` 同时
验证了模拟层与真实 `rtk` CLI 层的双顺序收敛）。

**故障隔离**：pi 的 runner 不捕获扩展 handler 异常——pi-safe-rm 会因此
将内部错误**吞掉并 fail-open**（命令原样放行、控制台留日志），确保即使自身
有 bug 也不会中断工具链、不影响 RTK 或其他扩展。

## Safety design

- **Fail-open**: unparsable segments are left unchanged, never mangled.
- **Escape hatch**: prefix a command with `SAFE_RM_USE_RM=1` to delete for real.
- **No gio → no rewrite**: on systems without `gio`, commands run as-is.
- **No RTK conflict**: RTK's rewrite pipeline never touches `rm`; this
  extension never touches non-rm commands.

## Why

Coding agents run many `rm -rf` commands. One bad glob and a worktree is gone.
Trash the files; recover from the recycle bin; uninstall the fear.

## License

MIT
