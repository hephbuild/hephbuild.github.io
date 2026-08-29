---
title: "Runners"
sidebar_position: 9
description: Run a target's command inside a described environment — a devenv shell, a container — instead of on the bare host.
---

# Runners

An **exec runner** decides *where* a target's command actually runs: on the
host as usual, inside a devenv shell, or inside a container. An
[Exec](/docs/plugins/exec) (`exec`/`bash`) target can name one, and so can a
[Go](/docs/plugins/go) target through the provider's own `runner` option.

## Using a runner

Point a target at a runner target's address:

```python title="BUILD"
target(
    name = "build",
    driver = "bash",
    run = "make",
    out = "out/",
    runner = "//tools/devenv:runner",
)
```

Or set it once for the whole workspace, on the driver:

```yaml title=".hephconfig"
plugins:
  - builtin: exec
    options:
      runner: "//tools/devenv:runner"
  - builtin: bash
    options:
      runner: "//tools/devenv:runner"
```

A target's own `runner` field wins over the driver-wide default. Either way,
`runner = "local"` is the explicit opt-out — for the one target in a
workspace-wide default that must still run on the bare host.

A runner is a hashed dependency: naming one, or a change to the environment it
resolves to, changes the target's cache key. An unchanged environment stays a
cache hit.

:::warning
A runner target must not run under the workspace-wide default it configures.
The natural way to write one is a `bash` target, which would otherwise become
its own runner and cycle on the first build — the `exec`/`bash` driver
excludes a target from a default it is itself. If the runner's own `deps` are
themselves `exec`/`bash` targets, give them `runner = "local"` explicitly, or
a workspace-wide default turns them into a cycle too.
:::

## What runs where

| Plugin | Driver | Describes |
|---|---|---|
| [Devenv](/docs/plugins/devenv) | `devenv_runner` | A [devenv](https://devenv.sh) shell. |
| [OCI](/docs/plugins/oci#running-targets-inside-a-container) | `oci_runner` | A running container. |

Both are targets like any other: build one, point other targets at its
address. Nothing else about the consuming target changes — its own `deps`,
`tools`, `env`, and sandbox behave exactly as they do without a runner; only
where the command executes differs.

## The environment a target sees

```text
env_clear  +  the runner's environment  +  the target's own
```

The target's own `env`, `pass_env`, deps, and tools always win over anything
the runner's environment provides — a target that declares something gets
what it declared, even inside an environment that has an opinion of its own.

`PATH` is assembled rather than overridden, because it is a list and both
sides legitimately contribute:

```text
PATH = the target's tools  ++  the target's own declared PATH entries  ++  the runner's PATH
```

Tools lead, so a target that declares a tool gets that one even when the
runner's environment ships a program by the same name.

:::note
The exec driver's own fallback `PATH` (`/usr/local/bin:/usr/bin:/bin`, or its
[`path`](/docs/plugins/exec#configuration) option) does not apply under a
runner — it exists only as a fallback for a target with no environment of its
own.
:::

## Writing your own

Most workspaces reach for a plugin-provided runner
([Devenv](/docs/plugins/devenv), [OCI](/docs/plugins/oci#running-targets-inside-a-container)).
A runner is nothing more than a target whose single output is a
`runner.json` file, so any driver able to write one qualifies — a
hand-written [Textfile](/docs/plugins/textfile) target is a legitimate runner.

```json title="runner.json"
{
  "version": 1,
  "fingerprint": "devenv:9f2c4e1b7a0d3856",
  "runner": "wrap",
  "config": {
    "env": {"PATH": "/nix/store/.../bin:..."}
  }
}
```

| Key | Meaning |
|-----|---------|
| `version` | Format version. Currently `1`. |
| `fingerprint` | A string that changes if and only if the described environment changes — see below. |
| `runner` | The runner implementation to use: `wrap`, `session`, or a name a plugin registered. |
| `config` | Configuration specific to that implementation. |

### The built-in runner implementations

| `runner` | Behavior | `config` |
|---|---|---|
| `wrap` | Static rewrite of the command: an argv prefix and an environment, applied at spawn. | `prefix` — argv prepended to the command; its head becomes the program. `env` — hashed, applied over the target's own. `runtime_pass_env` — host variables pulled in by name at spawn time; unhashed. |
| `session` | Holds one process open inside the environment for the whole build, and runs each target inside it. | `launch` — argv that enters the environment; the target's command is appended to it. `cwd` — where `launch` runs. |

`session` has no `env` key, deliberately: the held process's own environment
*is* the environment targets run in, so there is nothing separate to declare.

### The fingerprint

A consumer's cache key comes from the runner target's own hashout — the bytes
of `runner.json`. If those bytes don't move when the environment does, every
consumer keeps serving artifacts built against the *old* environment,
silently, forever — including from a shared remote cache. Two rules follow:

1. **Derive it from the resolved environment, never from the files you read to
   build it.** A config file can import other files a declared input never
   named, so hashing the source files misses exactly the change that matters.
2. **It must be stable across runs of an unchanged environment.** One
   leftover per-invocation value in the capture makes the fingerprint move on
   every build, and every consumer in the workspace goes permanently cold —
   with nothing erroring, and nothing pointing back here.

See [Devenv](/docs/plugins/devenv#fingerprint) for a worked example: it derives
its fingerprint from the resolved shell rather than from `devenv.nix`, for
exactly this reason.
