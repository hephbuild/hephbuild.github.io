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
