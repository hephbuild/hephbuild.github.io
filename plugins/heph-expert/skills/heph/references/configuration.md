# .hephconfig reference

`.hephconfig` sits at the workspace root and marks it as a heph project. It is
**YAML**. It registers the plugins the build uses and tunes engine-level
settings. Source: `https://hephbuild.github.io/docs/reference/configuration.md`.

```yaml title=".hephconfig"
version: 1.2.3
providers:
  - name: buildfile
drivers:
  - name: bash
```

## Keys (all optional)

| Key | Type | Default | Description |
|---|---|---|---|
| `version` | semver string | — | Pins the heph release that runs this workspace, so every machine/CI job resolves the same toolchain. Set it once at the top. |
| `providers` | list of `{name, options}` | `[]` | Providers to register — plugins that discover targets. |
| `drivers` | list of `{name, options}` | `[]` | Drivers to register — plugins that execute targets. |
| `homeDir` | path | unset | Where heph keeps its home and cache. |
| `memCache` | `{perEntryBytes, capacityBytes}` | unset | In-memory cache sizing. |
| `fuse` | `{enabled: true \| false \| "auto"}` | off | Sandbox overlay mode. |
| `lock` | `{backend: fs \| mem}` | `fs` | Execute-phase lock backend. |

## Registering plugins

Each entry has a `name` and an optional `options` map passed to that plugin. The
engine only wires plugins by name; it does not interpret `options` — the allowed
keys are defined by each plugin (see `plugins.md`).

```yaml title=".hephconfig"
providers:
  - name: buildfile
    options:
      patterns: [BUILD, "*.BUILD"]
      skip: [vendor, "third_party/**"]
  - name: go

drivers:
  - name: bash
  - name: nix
```

**Built-in vs opt-in.** Some plugins are always available and need no
registration: `group`, `fs`, `hostbin`, `query`. The exec drivers (`exec`,
`bash`, `sh`) are built-in but should be listed under `drivers:` to use them.
Others must be registered before a target can use them — e.g. the `go` provider
and its `go_golist`/`go_embed`/`go_testmain` drivers, and the `nix` driver. Each
plugin page states which.

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
