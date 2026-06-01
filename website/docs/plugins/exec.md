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

```yaml
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
| `codegen`          | Copy or link generated outputs back into the source. |

These environment variables are available inside the sandbox:

| Variable                      | Meaning                  |
|-------------------------------|--------------------------|
| `SRC` / `SRC_<group>`         | Dependency paths.        |
| `LIST_SRC` / `LIST_SRC_<group>` | Dependency list files.   |
| `TOOL` / `TOOL_<group>`       | Tool paths.              |
| `OUT` / `OUT_<group>`         | Output paths.            |
| `WORKSPACE_ROOT`              | Root of the workspace.   |
| `PATH`                        | Executables search path. |
