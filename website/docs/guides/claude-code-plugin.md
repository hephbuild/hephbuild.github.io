---
title: "Claude Code plugin"
sidebar_position: 4
description: Install the heph-expert plugin to make Claude Code an expert on your heph workspace.
---

# Claude Code plugin

`heph-expert` is a [Claude Code](https://claude.com/claude-code) plugin that
teaches Claude how heph works — so it writes correct BUILD files, debugs cache
misses and sandbox failures, and explains the target graph instead of guessing.

It ships from this docs site, which doubles as a plugin **marketplace**.

## Install

Run both commands inside Claude Code:

```text title="Claude Code"
/plugin marketplace add hephbuild/hephbuild.github.io
/plugin install heph-expert@heph-marketplace
```

The first command registers the marketplace from this repository; the second
installs the plugin. Restart Claude Code if prompted.

## What you get

| Piece | What it does |
|---|---|
| **Skill `heph`** | Auto-activates whenever Claude sees a heph workspace — `.hephconfig`, BUILD files, `heph` commands, or `//pkg:name` addresses. Carries the full model and per-topic references (concepts, authoring, CLI, configuration, plugins). |
| **Agent `heph-expert`** | A specialist subagent for larger jobs: designing or refactoring a target graph, diagnosing rebuilds, debugging sandboxes, tuning config. |
| **`/heph-target`** | Scaffold a new target from a plain-language description. |
| **`/heph-debug`** | Debug a failing target inside its sandbox. |
| **`/heph-explain`** | Explain why a target did or didn't rebuild. |
| **`/heph-ci`** | Set up or review heph in CI. |

The skill activates on its own — you don't invoke it. Type a command with its
leading slash; address the agent by name ("ask the heph-expert to…").

:::tip
The plugin's bundled knowledge mirrors these docs. When an exact flag or option
matters, the skill fetches the matching `.md` doc page live (indexed at
[llms.txt](https://hephbuild.github.io/llms.txt)), so it stays current even
between plugin updates.
:::

## Update

Pull the latest marketplace catalog, then upgrade:

```text title="Claude Code"
/plugin marketplace update heph-marketplace
/plugin install heph-expert@heph-marketplace
```

## Uninstall

```text title="Claude Code"
/plugin uninstall heph-expert@heph-marketplace
```
