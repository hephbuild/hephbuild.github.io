---
title: "Caching"
sidebar_position: 5
description: How heph turns input hashes into cache hits, and how to control and clean the cache.
---

# Caching

heph caches at the granularity of a target. Before running anything it hashes a
target's complete inputs into a single digest; if that digest is already in the
cache, heph returns the stored output instead of re-running the action. That is
a **cache hit**.

```bash title="terminal"
$ heph run //app:server
0.565s · 1 / 1 done · 1 cached · 0 failed
```

## What goes into the hash

Everything a target declares folds into its input hash: its sources, its
dependencies' outputs, the tools it uses, its environment, and the target
definition itself. Change any of them and the digest changes, so the target
re-runs. Leave them all identical and you get the cached bytes — on your laptop
or in CI. This is the foundation of [reproducibility](/docs/concepts/reproducibility).

:::note
Because outputs are content-addressed by their inputs, a cache hit is provably
the exact artifact you *would* have built. The cache is trustworthy, not a guess.
:::

## Fixed-point caching

A target whose inputs equal its outputs reaches a fixed point: re-running it
produces the same digest, so it's a cache hit and never executes again. This is
what makes idempotent [codegen](/docs/concepts/codegen) (an `in_place` formatter,
say) free to re-run — once the tree is formatted, the formatter is a no-op hit.

## Controlling caching per target

Whether a target caches, and how aggressively, is a property of the
[driver](/docs/plugins) that runs it. The [exec](/docs/plugins/exec) driver
exposes a `cache` field — a bool, or a map of `{enabled, remote, history}` — to
opt a target out or tune retention. See the driver's page for the exact shape.

## In-memory cache

Within a single run, heph also keeps results in memory. Size it with the
[`memCache`](/docs/reference/configuration#memcache--in-memory-cache) block in
`.hephconfig`; `capacityBytes: 0` disables it.

## Reclaiming space

The on-disk cache grows as inputs change. Garbage-collect entries that are no
longer reachable:

```bash title="terminal"
heph tool gc
```
