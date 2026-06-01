---
sidebar_position: 1
title: Targets & rules
description: How heph models a build as a graph of content-addressed targets.
---

# Targets &amp; rules

A **target** is the unit of work in heph: a name, a set of inputs, and the
action that turns those inputs into outputs. Targets are addressed by path,
using the `//` prefix that gives the project its mark:

```text
//app:server
//lib/auth:lib
//proto:api
```

## The dependency graph

Edges between targets form a DAG. heph walks it bottom-up: a target can only run
once every dependency has produced its outputs. Independent targets run
concurrently across every core.

| Term        | Meaning                                   |
|-------------|-------------------------------------------|
| `target`    | A named, cacheable unit of work.          |
| `hashin`    | The hash of a target's complete inputs.   |
| `cache hit` | A hashin already present in the cache.    |
| `sandbox`   | The isolated directory an action runs in. |

:::tip
Keep targets small and explicit. The finer the graph, the more heph can cache
and parallelize.
:::
