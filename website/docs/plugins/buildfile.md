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
subtrees, etc. Patterns are matched against the workspace-relative path of
each directory using [wax](https://github.com/olson-sean-k/wax) glob syntax.

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
