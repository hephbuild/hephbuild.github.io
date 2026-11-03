---
title: "Entrypoints"
sidebar_position: 4
description: Run a tool from your workspace in your own terminal, with its dependencies built first.
---

# Entrypoints

An **entrypoint** is a target you *run*, not build: a dev server, a formatter, a
CLI pinned to the workspace's version of a tool. `entrypoint = True` on an
`exec` or `bash` target makes `heph run` build its dependencies, tools and
credentials, then run the command in **your** terminal, in **your** directory,
with **your** environment.

```python title="web/BUILD"
target(name = "dev", driver = "bash", entrypoint = True, args = True,
       deps = {"node": "//tools:node"},
       run = '"$SRC_node/bin/node" server.js "$@"')
```

```bash title="terminal"
heph run //web:dev -- --port 4000
```

An entrypoint is never cached, never another target's input, and is always
invoked on its own, by address.

## Options

| Option | Default | Meaning |
|---|---|---|
| `entrypoint` | `False` | Run the target in the caller's world instead of building it. |
| `args` | `False` | Append the arguments after `--` to the command (`"$@"` in `bash`). Without it, arguments are refused before anything builds. |
| `workdir` | `"caller"` | Where the command runs: `"caller"` (the directory you ran `heph` from), `"tree_root"` (the workspace root, in your tree), `"tree_package"` (the directory of the package the target is declared in, in your tree), or `"sandbox"` (a private sandbox, as a build runs; nothing written there survives the run). |

`out`, `cache`, `codegen`, `support_files`, `pass_env`, `runtime_pass_env`,
`runtime_env` and `runner` are refused on an entrypoint.

The command sees your environment unchanged, with the target's `env` and
credentials layered on top. `$HEPH_ROOT` is the real workspace root.

## Terminal modes

On a terminal, heph runs the tool on a pseudo-terminal it owns and passes your
keyboard and screen through. With `--raw`, or whenever stdin, stdout or stderr
is not a terminal, the tool uses your terminal's own file descriptors and no
byte passes through heph.

```bash title="terminal"
heph run //web:dev --raw
```

| | Default on a terminal | `--raw` |
|---|---|---|
| Progress display | While dependencies build | None |
| Ctrl-C | Signals the tool's foreground process group | Signals the shared process group |
| Ctrl-Z | Does nothing to a plain tool | Stops the tool and heph; `fg` resumes |
| Pipes and files | Byte-exact (a redirected run is never put on a pseudo-terminal) | Byte-exact |

Use `--raw` when a tool needs real Ctrl-Z or exact terminal behavior, and from
scripts and agents: stdout carries only the tool's output, stderr only
failures. With no progress display, an `approval`-gated target is refused
unless you pass `--auto-approve`.

To see which mode a run took, and why:

```bash title="terminal"
HEPH_LOG=entrypoint_mode=debug heph run //web:dev
```

:::warning
After `kill -9` on heph, a terminal in the default mode stays in raw mode.
Run `reset`.
:::

:::note
An entrypoint's output is neither logged nor redacted. A tool that prints a
credential shows it.
:::

## Exit status

| Status | When |
|---|---|
| the tool's code | The tool exited, with any code. |
| the tool's signal | The tool was killed by a signal; heph dies of the same signal. |
| `125` | heph failed after resolving the entrypoint and before the tool ran: a dependency failed, an argument was refused, or the program could not be started. |
| `130` | Ctrl-C cancelled the run while dependencies were building. |
| `1` | The target could not be resolved (a typo, a broken BUILD file, or not an entrypoint). |

A failure of heph's own also prints an error to stderr.

## Debugging with a shell

`heph run //web:dev --shell` opens a shell where the tool would run, with the
same command ready. Inside it, `show` prints the command, `run` runs it
(`run --port 5000` replaces the arguments), and `exit 3` leaves with status 3.
`--shell` can't be combined with `--raw`.

See also [Interactive debugging with `--shell`](/docs/plugins/exec#interactive-debugging-with---shell).
