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
