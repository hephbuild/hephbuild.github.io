---
title: "Resources"
sidebar_position: 8
description: Declare what a target costs to run — CPUs, memory, or any limited thing — so heph runs as much in parallel as fits.
---

# Resources

A **resource** is something a target uses while it runs and that the machine has a limited amount of: CPUs, memory, a docker daemon, a GPU. A target declares what it needs; heph starts targets so that the total in use never exceeds what the machine (or your config) provides.

```python title="BUILD"
target(
    name = "build",
    driver = "bash",
    run = "make",
    env = {"MAKEFLAGS": "-j${resource:cpu}"},
    resources = {"cpu": 4, "memory": "8G"},
)
```

heph **tells**, it does not police. Nothing kills, throttles or pins a process that uses more than it reserved, and no resource value affects the [cache key](/docs/concepts/caching).

## Declaring a cost

`resources` maps a pool name to an amount. A **pool** is one kind of resource with a capacity.

```python title="BUILD"
resources = {"cpu": 0.5, "memory": "2G", "docker": 1}
```

An amount is a number or a string, read in its pool's unit:

| Unit | Written as | Examples |
|---|---|---|
| `cpu` | decimal ≥ 0 | `4`, `0.5`, `"0.25"` |
| `bytes` | whole number, or digits followed by `K`, `M`, `G` or `T` (binary: `4G` is 4·2³⁰) | `"8G"`, `"4096M"`, `1024` |
| `count` | whole number | `1`, `"2"` |

Pool names match `[a-z][a-z0-9_]{0,63}`, and a target names at most 16 pools. Naming a pool that isn't configured is an error, and `heph validate` reports it.

A target that declares no `cpu` costs 1 CPU. HTTP downloads, OCI and Go module downloads cost 0.1 CPU; `fs` targets and relocating `group` targets cost nothing. Undeclared `memory` and custom pools cost 0.

:::note
A target that costs nothing on any bounded pool starts immediately and is never queued, so nothing limits how many run together. Don't declare `cpu: 0` on a target that spawns heavy processes.
:::

## Configuring pools

`cpu` and `memory` always exist. Declare any other pool in `.hephconfig`:

```yaml title=".hephconfig"
resources:
  cpu: 8                                   # CPUs, or a percentage of the default
  memory: 24G                              # a size, or a percentage
  docker: 2                                # a count
  scratch_disk: {unit: bytes, value: 64G}  # full form, another unit
  tokens: {unit: count}                    # no value: unbounded
  gpu: 0                                   # exists; each run sets its capacity
```

- A bare amount uses the pool's default unit: `cpu` for `cpu`, `bytes` for `memory`, `count` for any other pool.
- A custom pool without a value is **unbounded**: nothing waits, but usage is still counted and shown.
- A capacity of `0` means the run must set it. Targets using the pool validate everywhere, and fail at start-up if the pool isn't set.
- Percentages (`50%`, `75%`) are of the default and only work for `cpu` and `memory`.

**Defaults.** `cpu` is the number of cores. `memory` is the memory heph may use: the container limit on Linux when one is set, otherwise physical memory. Set `memory` explicitly if you want a laptop and a CI container to behave the same.

`resources:` merges per pool across [profiles](/docs/reference/configuration#profiles--layered-config-overlays).

### Per-run overrides

| Override | Effect |
|---|---|
| `--resource <name>=<n>` | Sets one pool for this run. Repeatable; declares the pool if the config doesn't. |
| `HEPH_RESOURCE_<NAME>=<n>` | Same, from the environment (`HEPH_RESOURCE_GPU=2`). |
| `-j N` / `--jobs N` | Same as `--resource cpu=N`. |

Precedence: flag, then environment, then config, then default.

:::warning
`-j N` is the number of **CPUs** the run may reserve at once, not a number of targets. The default is the core count (it used to be twice that in target slots), so a workspace whose targets declare nothing runs fewer at once than before. Use `-j 200%` to restore the old concurrency.
:::

## Reading the allotment

heph passes nothing to a target's environment. Ask for the amount by name with `${resource:<pool>}`, and map it onto your tool:

```python title="BUILD"
target(
    name = "crate",
    driver = "bash",
    run = "cargo build --release",
    env = {"CARGO_BUILD_JOBS": "${resource:cpu}"},
    resources = {"cpu": 8},
)
```

It is replaced at run time with the amount granted, as a whole number: `cpu` is rounded up (a `cpu: 0.5` target is told `1`), `bytes` and `count` are integers. It works anywhere a [deferred value](/docs/concepts/deferred-values) does, such as `env` and `run`.

A pool the target doesn't reserve, or a name that isn't a pool, is an error when the target is loaded.

Entrypoints reserve nothing, so `${resource:cpu}` there is the whole `cpu` capacity.

### Sizing from the host

`heph.core.resource("cpu")` returns the host's CPU count and `heph.core.resource("memory")` its memory in bytes. Use them for the amount:

```python title="BUILD"
target(name = "link", ..., resources = {"cpu": heph.core.resource("cpu") / 2})
```

This is the machine's value, not the current run's pool. Use it only for a `resources` amount; anywhere else it puts a per-machine value in the target definition.

### Go tests

The `go` provider's `test` state accepts `resources` for generated test targets. See [Test environment](/docs/plugins/go#test-environment).

## How targets are admitted

- **First come, first served.** The target at the head of the queue waits until all of its pools fit, and nothing behind it starts meanwhile.
- **All or nothing.** A target never holds CPUs while waiting for memory.
- **Clamped.** A request above a pool's capacity is reduced to it: `cpu: 16` on a 4-CPU run waits for an empty pool, runs alone, and is told `4`.

The TUI header shows each pool in use as `held/capacity`. A clamped target is marked, for example `[cpu 16→4]`. A target waiting more than 5 seconds is listed with what it waits for:

```
⧗ //a:b waits for cpu 4 (2 free, 6 ahead, 41s)
```

## The contract

Resources never enter the cache key: changing `resources`, `-j`, or a pool's capacity keeps your cache hits. So:

> A target's outputs must not depend on its allotment.

Use `${resource:cpu}` to size parallelism, never to choose content. A target that can't avoid it should set `cache = False`.

A custom pool serialises access to an external thing, such as `docker: 1` for one target at a time using the daemon. The thing itself is still an undeclared input: holding the pool doesn't make a target hermetic.
