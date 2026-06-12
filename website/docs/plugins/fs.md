---
title: "Filesystem"
sidebar_position: 4
description: Reference files and directories from the workspace filesystem.
---

# Filesystem

The fs plugin reads files and directories from the workspace filesystem. It
provides two target types: `file` for referencing a single file, and `glob`
for matching multiple files with patterns. Both types emit output artifacts
that can be consumed by other build targets as inputs, which lets the rest of
the graph depend on raw workspace content without copying or restating paths.

## Driver

A **driver** is the component that knows how to execute a particular kind of
target. The fs plugin registers a single driver named `fs`.

## Enabling it

Built-in and auto-registered. The `fs` driver is always available in heph and
does not require configuration in `.hephconfig`.

## Usage

```text
//@heph/fs:file@f=src/main.rs
//@heph/fs:glob@p=src/**/*.rs@e=vendor/**,generated/**
```

## Provider functions

The fs plugin exposes helper functions in every BUILD file under the `heph.fs`
namespace. These compute path values at BUILD-eval time; they return strings (or
lists of strings), not target addresses.

| Function | Signature | Returns |
|----------|-----------|---------|
| `heph.fs.glob` | `glob(pattern: string) -> list[string]` | Paths of files matching `pattern`, relative to the current package. |
| `heph.fs.join` | `join(*elems: string) -> string` | Join path elements with `/` and clean the result (Go `path.Join` semantics). |
| `heph.fs.dir` | `dir(path: string) -> string` | Directory component of `path`. |
| `heph.fs.base` | `base(path: string) -> string` | Base name of `path`. |

```python title="BUILD"
target(
    name = "release",
    driver = "bash",
    run = ["cp $SRC $OUT"],
    out = heph.fs.join("dist", heph.core.os(), heph.core.arch(), "server"),
)
```

:::note
`heph.fs.glob(pattern)` returns a list of file path strings evaluated at
BUILD-eval time. The top-level `glob(pattern)` builtin returns a filesystem
_target address_ for use as a build input. Use `heph.fs.glob` when you need
path strings, and `glob()` when you need a build dependency.
:::

All four functions enforce their argument types: wrong type, missing required
argument, or unknown keyword produce a clear error naming the function and the
offending argument.

Run `heph inspect functions` to list every provider function available in the
current workspace with its full signature.

## Notes

Path normalization: all paths are normalized (`.` and `..` segments are
collapsed), and leading/trailing `../` escapes are rejected to prevent escaping
the workspace root.

Glob patterns support the `*`, `?`, `[..]`, `{..}`, and `**` operators. Within a
single build request, glob results are reused to avoid walking the tree twice.

:::tip
In a BUILD file you rarely write these addresses by hand — the `file()` and
`glob()` [builtins](./buildfile.md#authoring-build-files) produce them for you.
:::
