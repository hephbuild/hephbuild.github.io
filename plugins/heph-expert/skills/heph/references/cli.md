# heph CLI reference

The commands you'll use daily. Source:
`https://hephbuild.github.io/docs/reference/cli.md`.

Two argument forms recur across `run` and `query`:
- a single **target address** — `//cmd/server:bin`
- a **label** followed by a **package matcher** — `test //...` selects every
  target carrying the `test` label under the matcher.

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
| `--shell` | Drop into an interactive shell in the target's sandbox instead of running it (bash/sh). |
| `--cat-out` | Print output artifacts to stdout. |
| `--list-out` | Print the output file list to stdout. |
| `-e`, `--exclude <ADDR>` | Exclude a target address (repeatable). |
| `--frozen` | Fail if generated output differs from the tree (CI codegen check). |

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
| `heph inspect hashin <ADDR>` | The target's input hash — the cache key. Does not run the target. |
| `heph inspect hashout <ADDR>` | Content hash of each output artifact (runs or reads cache). |
| `heph inspect spec <ADDR>` | The raw, unresolved spec a provider returns, as pretty JSON. |
| `heph inspect def <ADDR> [--no-transitive]` | The resolved def (inputs, outputs, sandbox) as pretty JSON; transitive deps applied unless `--no-transitive`. |
| `heph inspect deps <ADDR> [-i/--interactive]` | The ref of each declared input, one per line; `-i` browses the tree in a TUI. |
| `heph inspect functions` | Every provider-exposed function, in `heph.<provider>.<fn>` form. |

Typical debugging sequence: `hashin` (what's in the key) → `deps` (the edges) →
`def`/`spec` (resolved vs raw) → `run --shell` (reproduce in the sandbox).

## `heph query`

Print the address of every matched target, one per line. Same address /
label+matcher forms as `run`, plus `-e` to exclude. Good for scripting and for
previewing what a matcher selects before running it.

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

## `heph tool`

Maintenance subcommands operating on the workspace or local cache.

| Subcommand | Does |
|---|---|
| `heph tool gc` | Garbage-collect the local cache (`.heph3/cache`): remove artifacts no longer reachable from any current target. Resolves specs, so providers may run. |
| `heph tool gen-gitignore [PACKAGE_MATCHER]` | Write/refresh the managed heph block in the root `.gitignore` with all `codegen = "copy"` outputs. Idempotent; a matcher rebuilds only that subtree's lines. |
| `heph tool completions <SHELL>` | Emit a shell completion-registration script, e.g. `source <(heph tool completions zsh)`. |

## `heph version`

Print the heph version string and exit.

## Installation

```bash
curl -fsSL https://hephbuild.github.io/install.sh | sh
```
