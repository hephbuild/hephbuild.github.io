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
|---------|---------|---------|
| `target(name, driver, **kwargs)` | the target's address | Declare a target. |
| `file(path, abs=False)` | a file address | Reference one workspace file as an input. |
| `glob(pattern, exclude=None, abs=False)` | a glob address | Reference many files by pattern. |
| `struct(**kwargs)` | a struct | Bundle named values to pass into a field. |
| `get_pkg()` | the current package path | Compute addresses relative to where the BUILD file lives. |
| `provider_state(provider, **kwargs)` | — | Hand package-level state to a provider. |

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

### Sharing symbols with `load()`

`load()` imports symbols from another Starlark file so common definitions live
in one place. A loaded helper registers its targets against the package that
*calls* it, not the file it is defined in:

```python title="BUILD"
load("//build/defs:go.star", "go_service")

go_service(name = "api")
```

