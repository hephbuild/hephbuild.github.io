---
title: "Dependencies"
sidebar_position: 4
description: How targets reference each other to form the build graph, and how outputs flow along the edges.
---

# Dependencies

A dependency is an edge in the build graph: one target consuming another's
outputs. Edges define both **order** and **data flow** — heph runs a target only
once every dependency has produced its outputs, and it makes those outputs
available to the dependent.

## Declaring an edge

A target references another by [address](/docs/reference/addresses), or by the
value returned from `target()` (which *is* its address):

```python title="BUILD"
lib = target(name = "lib", driver = "bash", run = "go build -o $OUT .", out = "lib")

target(
    name = "image",
    driver = "bash",
    deps = ["//assets:bundle", lib],
    run = "...",
    out = "image",
)
```

Independent targets run concurrently; only a real edge forces ordering. The
finer you split targets, the more heph can cache and parallelize.

## Outputs and groups

A target's outputs are its product. A target may split them into named **output
groups**, and a dependent can select a single group with the `|group`
[selector](/docs/reference/addresses#output-group-selector):

```text
//app:compile|bin     # depend on just the "bin" group
```

This keeps edges narrow: a consumer that needs only the binary doesn't rebuild
when an unrelated output group changes.

## How outputs reach the dependent

The build graph defines *that* an edge exists; **how** a dependency's files are
surfaced to a target is up to the [driver](/docs/plugins) that runs it. The
[exec](/docs/plugins/exec#dependencies) driver, for instance, exposes each
dependency group through `$SRC_<group>` environment variables inside the
sandbox. See the driver's page for its specific contract.

:::note
Every input must be declared. If a target reads a file it didn't list as a
dependency, the [sandbox](/docs/concepts/sandbox) won't contain it — the build
fails fast rather than silently depending on something untracked.
:::
