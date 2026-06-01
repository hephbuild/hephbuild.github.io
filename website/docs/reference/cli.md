---
sidebar_position: 1
title: CLI reference
description: The heph commands you'll use daily.
---

# CLI reference

The CLI command is `heph`. Everything operates on target paths (`//app:server`)
or path patterns (`//app/...`).

## `heph build`

Build one or more targets, pulling cache hits where digests match.

```bash
heph build //app:server
heph build //app/...          # everything under //app
heph build //... --remote     # use the shared remote cache
```

## `heph run`

Build a target and execute it.

```bash
heph run //app:server -- --port 8080
```

## `heph test`

Run test targets. Results are cached like any other action — unchanged tests are
not re-run.

```bash
heph test //...
```

## `heph query`

Inspect the graph without building.

```bash
heph query 'deps(//app:server)'
heph query 'rdeps(//..., //lib/auth)'
```

## Common flags

| Flag | Effect |
| --- | --- |
| `--remote` | Read/write the shared remote cache. |
| `--check-reproducible` | Rebuild and verify outputs are byte-identical. |
| `--sandbox=preserve` | Keep the sandbox on failure for inspection. |
| `-j, --jobs N` | Cap concurrent actions. |

:::note
Run `heph --version` to print the build banner and the resolved toolchain
digests.
:::
