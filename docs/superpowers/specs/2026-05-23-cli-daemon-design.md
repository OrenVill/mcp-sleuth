# CLI Daemon & Lock File Design

**Date:** 2026-05-23
**Branch:** feature/cli-daemon

## Goal

When `mcp-explorer` is started from the CLI it daemonizes (detaches from the terminal). If it is already running, the CLI prints a message with the port and exits. A `stop` subcommand kills the daemon.

## Approach

Re-spawn with `--daemon` flag (pure Node.js, no new dependencies).

## Lock File

**Path:** `~/.mcp-explorer/daemon.json`
**Schema:** `{ "pid": <number>, "port": <number> }`

Written by the daemon child after the server is listening. Deleted on daemon exit (SIGINT, SIGTERM, uncaught exception).

## Start Flow

1. Read `~/.mcp-explorer/daemon.json`.
   - If file exists and `process.kill(pid, 0)` succeeds → print already-running message and exit 0.
   - If file exists but process is dead → delete stale file, continue.
2. Re-spawn: `spawn(process.execPath, [binPath, '--daemon', ...portArgs], { detached: true, stdio: 'ignore' })`, then `child.unref()`.
3. Poll `daemon.json` for up to 5 seconds (50 × 100 ms) until `pid` appears.
4. Print `mcp-explorer started on http://127.0.0.1:{port}` and exit 0.
5. If poll times out → print error and exit 1.

**Daemon child (`--daemon` branch):**
1. Runs build-if-needed logic (same as today).
2. Tries ports BASE_PORT … BASE_PORT+9, starts server on first free port.
3. Writes `daemon.json` with `{ pid: process.pid, port }`.
4. Opens browser.
5. Registers `SIGINT`/`SIGTERM`/`exit` handlers to delete `daemon.json`.
6. Stays alive (event loop kept alive by HTTP server).

## Stop Flow (`mcp-explorer stop`)

1. Read `~/.mcp-explorer/daemon.json`. If missing → print `mcp-explorer is not running` and exit 0.
2. `process.kill(pid, 'SIGTERM')`.
3. Delete `daemon.json`.
4. Print `mcp-explorer stopped`.

## CLI Messages

| Situation | Message |
|-----------|---------|
| Daemon started | `mcp-explorer started on http://127.0.0.1:{port}` |
| Already running | `mcp-explorer is already running on http://127.0.0.1:{port}` |
| Stopped | `mcp-explorer stopped` |
| Not running (stop) | `mcp-explorer is not running` |
| Start timeout | `mcp-explorer: timed out waiting for daemon to start` |

All messages respect the existing `paint()` color helper (bold violet name, cyan URL).

## Files Changed

| File | Change |
|------|--------|
| `bin/mcp-explorer.js` | Add lock-check + re-spawn at top; add `stop` subcommand; wrap server-start in `--daemon` branch |
| `server.js` | No changes |

## Out of Scope

- `--foreground` / `--no-daemon` flag
- Status subcommand
- Windows native (WSL is the target environment)
