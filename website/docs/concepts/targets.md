---
sidebar_position: 1
title: Targets & rules
description: How heph models a build as a graph of content-addressed targets.
---

# Targets &amp; rules

A **target** is the unit of work in heph: a name, a set of inputs, and the
action that turns those inputs into outputs. Targets are addressed by path,
using the `//` prefix that gives the project its mark:

```
//app:server
//lib/auth
//proto:api
```

## Rules

A **rule** is the reusable function that produces a target. heph ships rules for
common languages and lets you define your own in Starlark.

```python
# A rule call produces one target.
go_library(
    name = "auth",
    srcs = glob(["*.go"]),
    deps = ["//lib/core"],
)
```

## The dependency graph

Edges between targets form a DAG. heph walks it bottom-up: a target can only run
once every dependency has produced its outputs. Independent targets run
concurrently across every core.

| Term | Meaning |
| --- | --- |
| `target` | A named, cacheable unit of work. |
| `digest` | The hash of a target's complete inputs. |
| `cache hit` | A digest already present in the cache. |
| `sandbox` | The isolated directory an action runs in. |

:::tip
Keep targets small and explicit. The finer the graph, the more heph can cache
and parallelize.
:::
