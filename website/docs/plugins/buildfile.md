---
title: "Buildfile"
sidebar_position: 2
description: Package provider that scans the workspace for Starlark BUILD files and parses target definitions from them.
---

# Buildfile

The buildfile plugin is a package provider that scans the workspace for BUILD
files containing Starlark code and parses target definitions from them. It
evaluates each BUILD file as Starlark to extract targets along with their
drivers, configuration, labels, and transitive dependencies, then hands those
targets to the build engine. BUILD file naming is customizable through glob
patterns, and `load()` statements let you share symbols across BUILD files so
common definitions can be reused throughout the workspace.

## Provider

A provider discovers targets and makes them available to the build engine
without running any of the work itself; the actual execution is delegated to
whatever driver each target names.

## Enabling it

Built-in. Register in `.hephconfig` under `providers` with name
`buildfile`. The plugin scans the workspace for BUILD files (or custom
patterns) and automatically makes those targets available to the build engine.

## Configuration

Register the provider and, optionally, tune which file names it treats as BUILD
files:

```yaml title=".hephconfig"
providers:
  - name: buildfile
    options:
      patterns:
        - BUILD
        - "*.BUILD"
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `patterns` | `string[]` | `["BUILD"]` | Glob patterns for BUILD file names to recognize. |
| `skip` | `string[]` | `[]` | Workspace-relative glob patterns for directories to exclude from the BUILD file walk. |

### Skipping directories

Use `skip` to prevent the provider from descending into directories you don't
want scanned — vendored code, generated output trees, large third-party
subtrees, etc. Each pattern is matched against the workspace-relative path of
the directory.

```yaml title=".hephconfig"
providers:
  - name: buildfile
    options:
      skip:
        - vendor
        - "third_party/**"
        - "generated/*"
```

## Usage

A matching BUILD file defines targets by calling `target()` in Starlark:

```python title="BUILD"
target(
    name = "hello",
    driver = "sh",
    run = ["echo hello"],
)
```

## Authoring BUILD files

BUILD files are written in Starlark — a small, deterministic dialect of Python.
The plugin exposes a fixed set of builtins:

| Builtin | Returns | Purpose |
|---------|---------|----------|
| `target(name, driver, **kwargs)` | the target's address | Declare a target. |
| `file(path, abs=False)` | a file address | Reference one workspace file as an input. |
| `glob(pattern, exclude=None, abs=False)` | a glob address | Reference many files by pattern. |
| `struct(**kwargs)` | a struct | Bundle named values to pass into a field. |
| `get_pkg()` | the current package path | Compute addresses relative to where the BUILD file lives. Prefer `heph.core.pkg()`. |
| `provider_state(provider, **kwargs)` | — | Hand package-level state to a provider. |
| `heph.core` | namespace | Host platform info and current package. See [below](#hephcore--host-platform). |

`file()` and `glob()` resolve to [filesystem](./fs.md) addresses, so their
results drop straight into a dependency field:

```python title="BUILD"
target(
    name = "lib",
    driver = "bash",
    deps = [glob("src/**/*.go", exclude = "src/**/*_test.go")],
    run = "go build -o $OUT ./src",
    out = "lib",
)
```

By default paths are resolved relative to the BUILD file's package; pass
`abs = True` to resolve from the workspace root instead.

### `target()` — what buildfile reads, and what it forwards

`target()` interprets only the fields that describe the target to the engine —
everything else is handed verbatim to the **driver**:

| Field | Required | Meaning |
|-------|----------|---------|
| `name` | yes | The target's name within its package. |
| `driver` | yes | The driver that executes it (`bash`, `go_golist`, `group`, …). |
| `labels` | no | A label or list of labels, used by [query](./query.md) and matchers. |
| `transitive` | no | Sandbox settings propagated to targets that depend on this one. |

:::note
Any other keyword (`run`, `deps`, `out`, `env`, `cache`, `codegen`, …) is
**driver-defined**. buildfile does not interpret it — it forwards the value to
the named driver, which decides what it means. For the fields a given driver
accepts, see that driver's page, e.g. [Exec](./exec.md) for `bash`/`sh`/`exec`.
:::

`target()` returns the new target's address, so you can bind it to a variable
and reference it from another target instead of retyping the address:

```python title="BUILD"
lib = target(name = "lib", driver = "bash", run = "go build -o $OUT .", out = "lib")

target(
    name = "image",
    driver = "bash",
    deps = {"bin": lib},
    run = "cp $SRC_BIN $OUT",
    out = "image",
)
```

### Relative addresses

Inside a BUILD file, `deps` (and any other address field) accept relative
address forms resolved against the BUILD file's own package. This avoids
repeating the package path for targets that live nearby.

```python title="app/BUILD"
# :name — a target in the same package (//app)
util = target(name = "util", driver = "exec", run = "...", out = "util")

target(
    name = "server",
    driver = "exec",
    deps = [
        ":util",        # same as //app:util
        "./config",     # same as //app/config (default target)
        "./proto:api",  # same as //app/proto:api
        "../shared",    # same as //shared (default target)
    ],
    run = "...",
    out = "server",
)
```

See [Addresses → Relative forms](/docs/reference/addresses#relative-forms) for the full reference table.

### `heph.core` — host platform

`heph.core` is a namespace available in every BUILD file. Use it to read the
host platform so targets can vary by operating system or CPU architecture.

| Function | Returns | Example values |
|----------|---------|----------------|
| `heph.core.os()` | normalized OS name | `"darwin"`, `"linux"`, `"windows"` |
| `heph.core.arch()` | normalized architecture | `"amd64"`, `"arm64"` |
| `heph.core.os_raw()` | host OS identifier | `"macos"`, `"linux"` |
| `heph.core.arch_raw()` | host architecture identifier | `"x86_64"`, `"aarch64"` |
| `heph.core.pkg()` | current package path | `"//tools/build"` |

`heph.core.os()` and `heph.core.arch()` return normalized names that match
the conventions used by container registries and most package distribution
tools. `heph.core.os_raw()` and `heph.core.arch_raw()` return the exact
identifiers the host reports — use those when a tool or URL scheme expects
non-normalized names.

`heph.core.pkg()` returns the current package path — the same value as the
top-level `get_pkg()`, which still works but `heph.core.pkg()` is preferred.

```python title="BUILD"
# Download a platform-specific binary
target(
    name = "tool",
    driver = "exec",
    run = [
        "curl -fsSLo $OUT https://releases.example.com/tool/{}/{}/tool".format(
            heph.core.os(),
            heph.core.arch(),
        ),
    ],
    out = "tool",
)
```

```python title="BUILD"
# Build different targets per platform
if heph.core.os() == "linux":
    target(name = "bundle", driver = "exec", run = ["./package-linux.sh"], out = "bundle")
else:
    target(name = "bundle", driver = "exec", run = ["./package-mac.sh"], out = "bundle")
```

### Sharing symbols with `load()`

`load()` imports symbols from another Starlark file so common definitions live
in one place. A loaded helper registers its targets against the package that
*calls* it, not the file it is defined in:

```python title="BUILD"
load("//build/defs:go.star", "go_service")

go_service(name = "api")
```
