---
title: "Exec"
sidebar_position: 3
description: Execution drivers for running shell commands in sandboxed target builds.
---

# Exec

The `pluginexec` plugin provides three execution drivers — `exec`, `bash`,
and `sh` — for running shell commands inside sandboxed target builds. It wires
up dependency injection, sets up environment variables, resolves the tools a
target needs on its `PATH`, and supports interactive shell debugging with PTY
allocation. Whenever a target runs a command to produce its outputs, one of
these drivers is doing the work.

## Driver

A **driver** is the component that knows how to execute a target's action and
turn its inputs into outputs. This plugin registers the drivers named `exec`,
`bash`, and `sh`.

## Enabling it

Built-in. Register in `.hephconfig` under `plugins` with `builtin: exec`,
`builtin: bash`, or `builtin: sh`. The optional `path` option sets the `PATH`
override, which defaults to `/usr/local/bin:/usr/bin:/bin` if empty or unset.

## Configuration

```yaml title=".hephconfig"
plugins:
  - builtin: exec
    options:
      path:
        - /usr/local/bin
        - /usr/bin
        - /bin
  - builtin: bash
    options:
      path:
        - /usr/local/bin
        - /usr/bin
        - /bin
  - builtin: sh
    options:
      path:
        - /usr/local/bin
        - /usr/bin
        - /bin
```

## Usage

```python title="BUILD"
target(
    name = "hello",
    driver = "bash",
    run = "echo hello world > $OUT",
    out = "greeting.txt",
    env = {"MY_VAR": "value"},
    pass_env = ["HOME", "USER"],
    deps = {"src": "//src:files"},
    tools = "//toolchain:gcc",
    cache = {"enabled": True, "remote": True, "history": 5},
)
```

## Notes

There are three driver variants:

| Driver | Behavior                                          |
|--------|---------------------------------------------------|
| `exec` | Direct command execution.                         |
| `bash` | Bash shell with job control.                      |
| `sh`   | POSIX shell, no bash-isms.                         |

The `bash` and `sh` drivers support an interactive `--shell` mode with PTY
allocation, which is useful for debugging a target's sandbox.

The following target config keys are available:

| Key                | Meaning                                              |
|--------------------|------------------------------------------------------|
| `run`              | List of commands to execute.                         |
| `deps`             | Hashed build-time dependencies.                      |
| `hash_deps`        | Hash-only dependencies.                              |
| `runtime_deps`     | Runtime-only dependencies.                           |
| `tools`            | Executables placed on `PATH`.                        |
| `out`              | Output groups and paths.                             |
| `support_files`    | Non-output artifacts.                                |
| `env`              | Literal environment variables.                       |
| `pass_env`         | Host vars passed at parse time and hashed into the cache key. Accepts `["*"]` to pass all. |
| `runtime_pass_env` | Host vars passed at run time only, not hashed. Accepts `["*"]` to pass all. |
| `runtime_env`      | Runtime literal environment variables.               |
| `cache`            | `True`/`False` toggles local + remote together; dict: `{enabled, remote, history}`. |
| `codegen`          | Write generated outputs into the source tree (`copy` or `in_place`). |

These environment variables are available inside the sandbox:

| Variable                      | Meaning                  |
|-------------------------------|-------------------------|
| `SRC` / `SRC_<group>`         | Dependency paths.        |
| `LIST_SRC` / `LIST_SRC_<group>` | Dependency list files.   |
| `TOOL` / `TOOL_<group>`       | Tool paths.              |
| `OUT` / `OUT_<group>`         | Output paths.            |
| `WORKSPACE_ROOT`              | Root of the workspace.   |
| `PATH`                        | Executables search path. |

## Dependencies

`deps` accepts either a **list** or a **dict**. The dict form names each group,
and that name becomes the suffix on the sandbox variables — `deps = {"src": …}`
surfaces as `$SRC_SRC` (and `$LIST_SRC_SRC`, a file listing every path in the
group, handy when a group expands to many files):

```python title="BUILD"
target(
    name = "bundle",
    driver = "bash",
    deps = {
        "code": glob("*.go"),
        "assets": "//web:assets",
    },
    run = "cat $LIST_SRC_CODE; cp -r $SRC_ASSETS $OUT",
    out = "bundle",
)
```

A plain list lands in the default group, available as `$SRC` and `$LIST_SRC`.

heph distinguishes three dependency kinds by how they affect the cache:

| Field          | Hashed into the key? | Present in the sandbox? | Use for |
|----------------|----------------------|-------------------------|--------|
| `deps`         | yes                  | yes                     | Normal build inputs. |
| `hash_deps`    | yes                  | no                      | Inputs that must invalidate the cache but the command never reads. |
| `runtime_deps` | no                   | yes (at run only)       | Things needed to *run* an output, not to build it — changing them is a cache hit. |

## Output groups

`out` mirrors `deps`: a string or list is the default group (`$OUT`), a dict
names groups (`$OUT_<group>`). Other targets select a specific group with the
`|group` suffix on the address:

```python title="BUILD"
target(
    name = "compile",
    driver = "bash",
    run = "go build -o $OUT_BIN .; go doc . > $OUT_DOC",
    out = {"bin": "app", "doc": "app.txt"},
)

target(
    name = "package",
    driver = "bash",
    deps = ["//app:compile|bin"],   # just the bin group
    run = "cp $SRC $OUT",
    out = "app.tar",
)
```

`support_files` declares files a target produces that are **not** outputs — kept
in the sandbox for the command's own use but not published to dependents.

## Environment passthrough

`pass_env` and `runtime_pass_env` each accept a list of variable names to
inherit from the host environment. Both also accept the special value `"*"` to
pass through every host environment variable:

| Field | Hashed into the cache key? | When applied |
|-------|----------------------------|--------------|
| `pass_env` | yes | At parse time. The full environment snapshot is folded into the input hash. |
| `runtime_pass_env` | no | At run time only. Variables are not hashed and do not affect the cache. |

Because `pass_env = ["*"]` hashes the entire host environment, any change to
any env var forces a rebuild. Only use it on targets where `cache` is disabled:

```python title="BUILD"
target(
    name = "local-tool",
    driver = "exec",
    run = ["./build.sh"],
    out = "tool",
    pass_env = ["*"],   # full env snapshot — only for uncached targets
    cache = False,
)
```

Use `runtime_pass_env = ["*"]` when the command needs the full environment at
run time but you still want caching — the environment will not affect the cache
key:

```python title="BUILD"
target(
    name = "run-tool",
    driver = "exec",
    run = ["./tool"],
    out = "result",
    runtime_pass_env = ["*"],   # full env at run time, not hashed
)
```

## Cache control

`cache` accepts a bare bool or a dict with up to three keys:

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `enabled` | bool | `true` | Enable local caching for this target. |
| `remote` | bool | `true` | Enable remote caching for this target. Set `false` when outputs embed host-local paths that cannot be safely shared across machines. |
| `history` | int | `1` | Number of past revisions to retain in the local cache (minimum `1`). |

A bare `True` sets both `enabled` and `remote` to `true`. A bare `False` disables both.

Use `cache = {"remote": False}` to keep local caching on but opt a specific
target out of remote push and pull — useful for targets whose outputs reference
paths that only exist on the machine that built them:

```python title="BUILD"
target(
    name = "wrapper",
    driver = "exec",
    run = ["./gen-wrapper.sh"],
    out = "wrapper.sh",
    cache = {"remote": False},
)
```

The target still builds and caches locally; it is never uploaded to or pulled
from a remote cache.

## Interactive debugging with `--shell`

When a target fails, drop into its sandbox with the exact inputs, tools, and
environment it would run with:

```bash title="terminal"
heph run //app:server --shell
```

The `bash` and `sh` drivers allocate a PTY and start an interactive shell inside
the prepared sandbox, so you can inspect `$SRC_*`, re-run the command by hand,
and see why it broke.
