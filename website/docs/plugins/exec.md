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

The drivers are built-in and automatically registered. List them in
`.hephconfig` under `drivers:` with the names `exec`, `bash`, or `sh`. The
optional `path` config sets the `PATH` override, which defaults to
`/usr/local/bin:/usr/bin:/bin` if empty or unset.

## Configuration

```yaml title=".hephconfig"
drivers:
  - name: exec
    options:
      path:
        - /usr/local/bin
        - /usr/bin
        - /bin
  - name: bash
    options:
      path:
        - /usr/local/bin
        - /usr/bin
        - /bin
  - name: sh
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
| `pass_env`         | Pass-through vars from the parent at hash time.      |
| `runtime_pass_env` | Pass-through vars at runtime only.                   |
| `runtime_env`      | Runtime literal environment variables.               |
| `cache`            | Bool or `{enabled, remote, history}`.                |
| `codegen`          | Write generated outputs into the source tree (`copy` or `in_place`). |

These environment variables are available inside the sandbox:

| Variable                      | Meaning                  |
|-------------------------------|--------------------------|
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
|----------------|----------------------|-------------------------|---------|
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

## Interactive debugging with `--shell`

When a target fails, drop into its sandbox with the exact inputs, tools, and
environment it would run with:

```bash title="terminal"
heph run //app:server --shell
```

The `bash` and `sh` drivers allocate a PTY and start an interactive shell inside
the prepared sandbox, so you can inspect `$SRC_*`, re-run the command by hand,
and see why it broke.
