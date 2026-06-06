---
title: "Inspecting builds"
sidebar_position: 3
description: Use heph inspect to answer why a target rebuilt, what it depends on, and what a provider produced.
---

# Inspecting builds

When a build does something surprising — a target rebuilds when you expected a
[cache hit](/docs/concepts/caching), or a dependency isn't where you think — the
`heph inspect` subcommands show you the engine's view. See the
[CLI reference](/docs/reference/cli) for full flag detail.

## "Why did this rebuild?"

A target rebuilds when its input hash changes. Compare the hash across runs to
find what moved:

```bash title="terminal"
heph inspect hashin //app:server
```

The input hash (`hashin`) folds in every declared input. If it changed, an input
changed. Pair it with the output hash to confirm what the target produced:

```bash title="terminal"
heph inspect hashout //app:server
```

## "What does this depend on?"

Print a target's dependency edges, or explore them interactively:

```bash title="terminal"
heph inspect deps //app:server
heph inspect deps //app:server -i      # interactive explorer
```

## "What did the provider produce?"

A [provider](/docs/plugins) turns BUILD files (or generated sources) into target
specs, which a [driver](/docs/plugins) then resolves into a definition. Inspect
each stage:

```bash title="terminal"
heph inspect spec //app:server     # the raw spec the provider emitted
heph inspect def //app:server      # the resolved definition (inputs, outputs, sandbox)
```

`spec` is what the provider produced before any driver interpreted it; `def` is
the fully resolved form the engine executes.

## Listing what exists

```bash title="terminal"
heph inspect packages              # all packages
heph inspect packages cmd/...      # packages under a matcher
heph inspect functions             # provider-exposed BUILD functions
```

`functions` lists the `heph.<provider>.<fn>` helpers available in BUILD files —
useful when a provider adds its own callable beyond the core
[builtins](/docs/plugins/buildfile#authoring-build-files).

## Reproducing the environment

To go past inspection and actually poke at a failing target, open its
[sandbox](/docs/concepts/sandbox):

```bash title="terminal"
heph run //app:server --shell
```
