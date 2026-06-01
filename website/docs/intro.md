---
slug: /
sidebar_position: 1
title: Introduction
description: What heph is, and why builds become fast, reproducible and trustworthy.
---

# Introduction

heph is an open-source build system and task orchestrator. You define targets;
heph hashes their inputs, runs each action in a sandbox, and content-addresses
the output. Same inputs, byte-identical artifacts — on your laptop and in CI.

> **Build once. Trust the cache.**

## The model in one minute

A build is a directed graph of **targets**. Each target declares its inputs and
the action that produces its outputs. Before running anything, heph hashes the
inputs. A matching digest is a **cache hit** — heph returns the cached output
instead of rebuilding.

```python title="BUILD.heph"
# a target is just data
go_binary(
    name = "server",
    srcs = ["main.go"],
    deps = ["//lib/auth", "//proto:api"],
)
```

:::note

Every input you reference — sources, deps, the toolchain — is tracked. If it
isn't declared, the sandbox won't see it.

:::

Build it, and watch heph rebuild only what changed:

```bash title="terminal"
$ heph build //app:server
//proto:api      cache hit   0.00s
//lib/core       cache hit   0.00s
//lib/auth       built       0.41s
//app:server     built       0.88s

2 cached · 2 built · 1.29s
```

## Why teams adopt heph

- **Content-addressed.** Every artifact is keyed by the hash of its inputs.
- **Sandboxed.** Each action sees only its declared inputs — no "works on my
  machine."
- **Minimal DAG.** Only the targets whose exact sources or dependencies changed
  are rebuilt.
- **Remote cache.** One build populates a shared cache; the whole team hits it.

## Next steps

- [Targets &amp; rules](./concepts/targets.md) — how the graph is defined.
- [Reproducibility](./concepts/reproducibility.md) — what "byte-identical"
  actually guarantees.
- [CLI reference](./reference/cli.md) — the commands you'll use daily.
