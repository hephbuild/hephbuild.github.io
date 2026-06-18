# .hephconfig reference

`.hephconfig` sits at the workspace root and marks it as a heph project. It is
**YAML**. It registers the plugins the build uses and tunes engine-level
settings. Source: `https://hephbuild.github.io/docs/reference/configuration.md`.

```yaml title=".hephconfig"
version: 1.2.3
plugins:
  - builtin: buildfile
  - builtin: bash
```

## Keys (all optional)

| Key | Type | Default | Description |
|---|---|---|---|
| `version` | semver string | — | Pins the heph release that runs this workspace, so every machine/CI job resolves the same toolchain. Set it once at the top. |
| `plugins` | list of plugin entries | `[]` | Plugins to register. Each entry sets exactly one of `builtin`, `path`, or `url`, plus an optional `options` map. |
| `homeDir` | path | unset | Where heph keeps its home and cache. |
| `memCache` | `{perEntryBytes, capacityBytes}` | unset | In-memory cache sizing. |
| `fuse` | `{enabled: true \| false \| "auto"}` | off | Sandbox overlay mode. |
| `lock` | `{backend: fs \| mem}` | `fs` | Execute-phase lock backend. |

## Registering plugins

`plugins` is a list of entries. Each entry must set exactly one of:

| Key | Loads |
|---|---|
| `builtin` | A compiled-in plugin by name (e.g. `buildfile`, `exec`). |
| `path` | A local `*-plugin.json` manifest (relative to the workspace root, or absolute). |
| `url` | A remote `*-plugin.json` manifest — downloaded and cached in `~/.heph/plugins/`. |

Each entry also accepts an optional `options` map. The allowed keys are defined
by each plugin (see `plugins.md`).

```yaml title=".hephconfig"
plugins:
  - builtin: buildfile
    options:
      patterns: [BUILD, "*.BUILD"]
      skip: [vendor, "third_party/**"]
  - builtin: bash
  - builtin: nix
  - path: .heph3/heph-go-plugin.json
    options:
      gotool: "//@heph/bin:go"
```

**Built-in vs opt-in.** Some plugins are always available and need no
registration: `group`, `fs`, `hostbin`, `query`. The exec drivers (`exec`,
`bash`, `sh`) are built-in but should be listed under `plugins:` to use them.
The `nix` driver must also be registered. The `go` plugin is **external** — it
is not compiled into the heph binary and must be loaded via `path:` or `url:`.
Each plugin page states which.

## `memCache` — in-memory cache

Bounds the cache kept in memory for the current run.

```yaml title=".hephconfig"
memCache:
  perEntryBytes: 16384      # largest single entry kept in memory
  capacityBytes: 67108864   # total budget; 0 disables the in-memory cache
```

## `fuse` — sandbox overlay

Opt-in: assemble sandboxes with a FUSE overlay instead of copying inputs.
Contents are identical either way (see `concepts.md` → *Sandbox*).

```yaml title=".hephconfig"
fuse:
  enabled: auto   # false (default) | true | auto (engine decides per target)
```

## `lock` — execute-phase lock backend

How heph serializes concurrent access during execution.

```yaml title=".hephconfig"
lock:
  backend: fs   # fs (default, coordinates across processes via the filesystem)
                # | mem (in-process; useful for ephemeral/single-process runs)
```
