---
slug: /
sidebar_position: 1
title: Introduction
description: What heph is, and why builds become fast, reproducible and trustworthy.
---

# Introduction

heph is an open-source build system and task orchestrator. You define targets;
heph hashes their inputs, runs each action in parallel in a sandbox, and content-addresses
the output. Same inputs, byte-identical artifacts — on your laptop and in CI.

> **Build once. Trust the cache.**

:::warning
Documentation for deprecated v0 can be found [here](https://hephbuild.github.io/heph).
:::

## The model in one minute

A build is a directed graph of **targets**. Each target declares its inputs and
the action that produces its outputs. Before running anything, heph hashes the
inputs. A matching digest is a **cache hit** — heph returns the cached output
instead of rebuilding.

```python title="BUILD"
target(
    name = "server",
    driver = "bash",
    run = "go build -o $OUT .",
    deps = [glob("**/*.go"), "//gen:assets"],
    out = "server",
)
```

:::note

Every input you reference — sources, deps, the toolchain — is tracked. If it
isn't declared, the sandbox won't see it.

:::

Build it, and watch heph rebuild only what changed:

```bash title="terminal"
$ heph run //app:server
0.565s · 1 / 1 done · 1 cached · 0 failed
```

## Next steps

- [Your first build](./guides/first-build.mdx) — from empty repo to a cached
  build in four steps.
- [Targets &amp; rules](./concepts/targets.md) — how the graph is defined.
- [Reproducibility](./concepts/reproducibility.md) — what "byte-identical"
  actually guarantees.
- [CLI reference](./reference/cli.md) — the commands you'll use daily.
