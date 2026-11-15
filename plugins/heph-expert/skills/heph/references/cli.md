# heph CLI reference

The commands you'll use daily. Source:
`https://hephbuild.github.io/docs/reference/cli.md`.

Two argument forms recur across `run` and `query`:
- a single **target address** — `//cmd/server:bin`
- a **label** followed by a **package matcher** — `test //...` selects every
  target carrying the `test` label under the matcher.

A label matches `[A-Za-z0-9_-]+`. The positional label argument is checked
against that grammar and errors when it isn't a valid label, pointing at `-e`
when the argument contains query syntax (`&&`, `||`, `!`, `(`, `)`, or
whitespace): `-e 'label(lint) && !label(go-lint) && //...'`.

---

## `heph run`

Build and run target(s): resolve, build the dependency graph, run — reusing
cached results when inputs are unchanged.

```bash
heph run <TARGET_ADDRESS>
heph run <LABEL> <PACKAGE_MATCHER>
```

| Flag | Description |
|---|---|
| `--force` | Force execution, ignoring any cached result. |
| `--shell` | Drop into an interactive shell in the target's sandbox instead of running it (bash driver). |
| `--cat-out` | Print output artifacts to stdout. |
| `--list-out` | Print the output file list to stdout. |
| `-e`, `--exclude <ADDR>` | Exclude a target address (repeatable). |
| `--frozen` | Fail if generated output differs from the tree (CI codegen check). |
| `--keep-failed-sandboxes` | Keep a failed target's sandbox on disk (until its next run) instead of removing it; the failure box prints its path. Global flag. |

Examples:
```bash
heph run //cmd/server:bin              # one target
heph run test //...                    # every target labelled "test"
heph run //cmd/server:bin --shell      # debug in the sandbox
heph run build //... -e //vendor/...   # run, excluding a subtree
```

## `heph inspect`

Read-only introspection of the build graph. Nothing executes unless a provider
must run a target to answer the query.

| Subcommand | Prints |
|---|---|
| `heph inspect packages [MATCHER]` | Packages matching a matcher (all if omitted), one per line. |
| `heph inspect labels [MATCHER]` | Unique labels declared across targets matching a matcher (all if omitted), sorted, one per line. |
| `heph inspect hashin <ADDR>` | The target's input hash — the cache key. Does not run the target. |
| `heph inspect hashout <ADDR>` | Content hash of each output artifact (runs or reads cache). |
| `heph inspect spec <ADDR>` | The raw, unresolved spec a provider returns, as pretty JSON. |
| `heph inspect def <ADDR> [--no-transitive]` | The resolved def (inputs, outputs, sandbox) as pretty JSON; transitive deps applied unless `--no-transitive`. |
| `heph inspect deps <ADDR> [-i/--interactive]` | The ref of each declared input, one per line; `-i` browses the tree in a TUI. |
| `heph inspect failure <ADDR> [--json]` | Where the target's last failure was kept (slot, `log`, `out`, `fixes`). Builds nothing; `--json` prints `null` when nothing is recorded. |
| `heph inspect functions` | Every provider-exposed function, in `heph.<provider>.<fn>` form. |

Typical debugging sequence: `hashin` (what's in the key) → `deps` (the edges) →
`def`/`spec` (resolved vs raw) → `run --shell` (reproduce in the sandbox).

## `heph query`

Print the address of every matched target, one per line. Same address /
label+matcher forms as `run`, plus `-e` to exclude. Good for scripting and for
previewing what a matcher selects before running it. `-e` accepts query
expressions including `label()`, `driver()` (whole name, case-sensitive) and
`tree_output()`. `--candidates` prints targets as providers list them without
resolving each one: faster, but may include targets that do not exist.

```bash
heph query //...
heph query test //cmd/...
heph query //... -e //vendor/...
```

## `heph validate`

Validate all targets: link the graph and check codegen outputs (including
`copy` output conflicts — overlapping or contained paths between different
targets).

```bash
heph validate                 # whole workspace
heph validate <PACKAGE_MATCHER>
```

## `heph session`

Watch heph runs going on in other terminals. Every run records a **session**
under `~/.heph/sessions/`; these commands only read it (never cancel, signal or
clean up). Docs: `https://hephbuild.github.io/docs/guides/sessions`.

| Subcommand | Does | Exit |
|---|---|---|
| `heph session list [--all] [--json]` | One row per session of this workspace (`--all`: every workspace), live first: ID, WORKTREE, COMMAND, STATE, EXIT, PROGRESS, NOW. | 0 |
| `heph session show <id> [--json]` | The progress view printed once, then "Stuck on": lock waits naming the holding session, resource waits, targets running over 30s, and a `Next:` command. | 0 |
| `heph session attach <id>` | Follow the session live until it ends; `q`/Ctrl-C detaches without cancelling it. Line form without a terminal. | the session's exit code; 0 on detach |
| `heph session inflight <id> [--json]` | Ask a running session for its in-flight report (open work); waits 5s. | 0 |

- `<id>`: full id, a live session's pid, or a unique prefix/suffix. Prefer the
  last 4–5 characters or the pid — ids start with the start time.
- The line backend prints `heph: session <id> (heph session attach <id>)` on
  stderr at start.
- STATE: `running`, `waiting` (every open target on a lock/resource wait),
  `quiet` (no event past `--stall-notice`, 60s when off — not a verdict),
  `ok`/`failed`, `lost` (died without recording its end), `unknown` (newer
  format).
- Every error of `heph session` itself exits **125**. `attach` mirrors the
  session's code, so a mirrored 125 is announced on stderr
  (`heph: session <id> exited 125`).
- Agents: read `list --json` / `show --json`. Use `blocked_on` and `progress`,
  not `now` (human text); `last_event_unix_ms` is the stable "gone silent"
  signal. `show --json` has `next: {kind, command, argv, cwd, reason}` — run
  `argv` in `cwd`; `command` is display text.
- A run waiting on another run's lock names it: `held by session <id> (pid N)`.
- Off: `HEPH_NO_SESSION=1`, or `heph run --raw`. A target that runs heph should
  set `HEPH_NO_SESSION=1` in its `env`.

## `heph tool`

Maintenance subcommands operating on the workspace or local cache.

| Subcommand | Does |
|---|---|
| `heph tool gc` | Garbage-collect the local cache (`.heph/cache`): remove artifacts no longer reachable from any current target, then return the cache database's free space to the filesystem (the first run on a cache from an older version rewrites the database once — minutes on a large one). Resolves specs, so providers may run. |
| `heph tool clean <TARGET_ADDRESS>` / `heph tool clean <LABEL> <PACKAGE_MATCHER>` / `heph tool clean -e <EXPR>` | Remove every cached revision of the selected target(s) — all of them, regardless of `history`, whether or not the target still exists. Selection required (no whole-cache default, so a bare `heph tool clean` prints help); `all <PACKAGE_MATCHER>` selects by package without a label, same as `query`. `heph tool clean all //...` clears the entire local cache. Needing this regularly on an unchanged target usually means that target under-declares an input — fix the target, don't make `clean` routine. |
| `heph tool codegen gitignore [PACKAGE_MATCHER]` | Write/refresh the managed heph block in the root `.gitignore` with all `codegen = "copy"` outputs. Idempotent; a matcher rebuilds only that subtree's lines. |
| `heph tool completions <SHELL>` | Emit a shell completion-registration script, e.g. `source <(heph tool completions zsh)`. |

## `heph version`

Print the heph version string and exit.

## Installation

```bash
curl -fsSL https://hephbuild.github.io/install.sh | sh
```
