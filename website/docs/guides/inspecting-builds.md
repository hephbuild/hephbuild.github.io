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

`functions` lists every provider function available in BUILD files, with its
typed signature — for example `fs.glob(pattern: string) -> list[string]`.
Useful when a provider adds its own callable beyond the core
[builtins](/docs/plugins/buildfile#authoring-build-files), or to check argument
names and types before writing a call.

## Reading failure output

When a target fails, heph prints a diagnostic box with the trailing lines of its
process log:

```
× target failed: //app:server
╰─▶ exit status: 1
    ╭─[log]
  91 │ connecting to db...
  92 │ FATAL: connection refused
    ╰────
```

Line numbers reflect the real position in the full log — the last 10 lines of a
100-line log are numbered 91–100, not 1–10.

By default, `heph run` shows 10 trailing lines. Use `--log-lines` to show more
or fewer:

```bash title="terminal"
heph run //app:server --log-lines 50
```

The full log is always saved as the `log.txt` artifact regardless of `--log-lines`.
To read it directly:

```bash title="terminal"
heph run //app:server --log-lines 0   # suppress the inline tail
heph run //app:server --cat-out       # print log.txt to stdout after the run
```

## Reproducing the environment

To go past inspection and actually poke at a failing target, open its
[sandbox](/docs/concepts/sandbox):

```bash title="terminal"
heph run //app:server --shell
```
