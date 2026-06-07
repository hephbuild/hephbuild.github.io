---
title: "Configuration"
sidebar_position: 2
description: Every key in .hephconfig — registering plugins and tuning the engine.
---

# Configuration

`.hephconfig` sits at the root of your workspace and marks it as a heph project.
It registers the [plugins](/docs/plugins) your build uses and tunes a handful of
engine-level settings. It is YAML.

```yaml title=".hephconfig"
version: 1.2.3
providers:
  - name: buildfile
drivers:
  - name: bash
```

## Pinning the version

```yaml title=".hephconfig"
version: 1.2.3
```

`version` pins the heph release that runs this workspace, so every machine and
CI job resolves the same toolchain. Set it once at the top of the file — see
[Getting started](/docs/getting-started).

## Keys

Every key below is optional.

| Key         | Type                          | Default | Description |
|-------------|-------------------------------|---------|-------------|
| `providers` | list of `{name, options}`     | `[]`    | Providers to register — the plugins that discover targets. |
| `drivers`   | list of `{name, options}`     | `[]`    | Drivers to register — the plugins that execute targets. |
| `homeDir`   | path                          | unset   | Where heph keeps its home and cache. |
| `memCache`  | `{perEntryBytes, capacityBytes}` | unset | In-memory cache sizing. |
| `fuse`      | `{enabled: true \| false \| "auto"}` | off | Sandbox overlay mode. |
| `lock`      | `{backend: fs \| mem}`        | `fs`    | Execute-phase lock backend. |

## Registering plugins

`providers` and `drivers` each take a list of entries. Every entry has a `name`
(the plugin to register) and an optional `options` map passed to that plugin:

```yaml title=".hephconfig"
providers:
  - name: buildfile
    options:
      patterns: [BUILD, "*.BUILD"]
  - name: go

drivers:
  - name: bash
  - name: nix
```

The keys allowed inside `options` are defined by each plugin — see its page
(for example [Buildfile](/docs/plugins/buildfile), [Exec](/docs/plugins/exec),
[Go](/docs/plugins/go)). The engine only wires plugins together by name; it does
not interpret their options.

:::note
Some plugins are built-in and always available (`group`, `fs`, `hostbin`,
`query`); others must be listed here before a target can use them. Each plugin
page states which.
:::

## `memCache` — in-memory cache

Bounds the cache heph keeps in memory for the current run.

```yaml title=".hephconfig"
memCache:
  perEntryBytes: 16384      # largest single entry kept in memory
  capacityBytes: 67108864   # total budget; 0 disables the in-memory cache
```

## `fuse` — sandbox overlay

Controls whether sandboxes are assembled with a FUSE overlay instead of copying
inputs. It is opt-in.

:::warning
The FUSE overlay is in development and not yet fully functional. Leave it off
for production builds.
:::

```yaml title=".hephconfig"
fuse:
  enabled: auto   # true | false | auto
```

| Value   | Behavior |
|---------|----------|
| `false` | Off. The default when the block or key is omitted. |
| `true`  | Forced on. |
| `auto`  | The engine decides per target. |

See [Sandbox](/docs/concepts/sandbox) for what the overlay changes.

## `lock` — execute-phase lock backend

Selects how heph serializes concurrent access during execution.

```yaml title=".hephconfig"
lock:
  backend: fs   # fs (default) | mem
```

`fs` coordinates across processes via the filesystem; `mem` keeps the lock
in-process (useful for ephemeral or single-process runs).
