---
title: "Configuration"
sidebar_position: 2
description: Every key in .hephconfig2 — registering plugins and tuning the engine.
---

# Configuration

`.hephconfig2` sits at the root of your workspace and marks it as a heph project.
It registers the [plugins](/docs/plugins) your build uses and tunes a handful of
engine-level settings. It is YAML.

```yaml title=".hephconfig2"
version: 1.2.3
providers:
  - name: buildfile
drivers:
  - name: bash
```

## Pinning the version

```yaml title=".hephconfig2"
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
| `fs`        | `{skip: string[]}`            | `{}`    | Workspace-wide ignore patterns shared with all tree-walking plugins. |
| `memCache`  | `{perEntryBytes, capacityBytes}` | unset | In-memory cache sizing. |
| `cache`     | `{spillThresholdBytes: number}` | `{}`  | Durable local-cache tuning. |
| `caches`    | map of `{uri, read, write, concurrency}` | `{}` | Named remote (shared) caches. |
| `fuse`      | `{enabled: true \| false \| "auto"}` | off | Sandbox overlay mode. |
| `lock`      | `{backend: fs \| mem}`        | `fs`    | Execute-phase lock backend. |
| `telemetry` | `{enabled: true \| false}`    | `{}`  (enabled) | Anonymous usage reporting. Set `enabled: false` to opt out. |

## Registering plugins

`providers` and `drivers` each take a list of entries. Every entry has a `name`
(the plugin to register) and an optional `options` map passed to that plugin:

```yaml title=".hephconfig2"
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

## `fs` — workspace ignore patterns

`fs.skip` is a list of workspace-root-relative patterns shared with every
tree-walking plugin — the `fs` plugin, the `buildfile` provider, and the `go`
provider. Patterns in this list apply everywhere at once, unlike per-plugin
`skip` options which affect only one provider.

```yaml title=".hephconfig2"
fs:
  skip:
    - vendor                  # literal dir — pruned by every plugin
    - "./node_modules"        # leading ./ is normalized (same as "node_modules")
    - "**/generated/**"       # glob — prunes any dir named generated at any depth
```

Each entry is interpreted by its shape:

| Entry shape | Effect |
|-------------|--------|
| Literal path (no `*`, `?`, `[`, `{`) | Pruned by exact match against workspace-relative paths. `./`-prefixed forms normalize to bare paths (`./vendor` → `vendor`). |
| Glob pattern (contains metacharacters) | Matched against workspace-relative paths using glob semantics. |

`.git` is always ignored — you do not need to list it.

### `fs.skip` vs per-plugin `skip`

The `buildfile` and `go` providers each accept their own `skip` option (under
`providers[name=buildfile].options.skip` and `providers[name=go].options.skip`).
Those apply only to the respective provider.

`fs.skip` is global: the engine merges it with every plugin's own `skip` list
before building the final ignore set, so the same path is pruned consistently
across every plugin.

Use `fs.skip` for workspace-wide exclusions (e.g. `vendor`, `node_modules`,
generated output trees). Use per-plugin `skip` for patterns that should only
affect one provider.

## `memCache` — in-memory cache

Bounds the cache heph keeps in memory for the current run.

```yaml title=".hephconfig2"
memCache:
  perEntryBytes: 16384      # largest single entry kept in memory
  capacityBytes: 67108864   # total budget; 0 disables the in-memory cache
```

## `cache` — local cache storage

Controls how heph stores artifacts in the durable on-disk cache.

```yaml title=".hephconfig2"
cache:
  spillThresholdBytes: 8388608   # optional; default is 8 MiB
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `spillThresholdBytes` | number | `8388608` (8 MiB) | Artifacts strictly larger than this are stored as plain files under `<homeDir>/cache/blobs/`. Smaller artifacts and all manifests stay in the cache database. |

Raising the threshold keeps more artifacts in the database; lowering it spills more to plain files. The default works well for most projects.

## `caches` — remote shared caches

A map of named remote caches. Each entry is keyed by a name you choose and
describes one backend:

```yaml title=".hephconfig2"
caches:
  shared:
    uri: s3://my-bucket/heph-cache
    read: true    # default
    write: true   # default
    concurrency: 10  # default
```

Multiple caches are allowed. heph writes to all writable caches in parallel
and reads from the fastest first. Latency is measured once per process (or
loaded from a persisted file) and refreshed when the definitions change.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `uri` | string | — | Backend URI. The scheme selects the backend (see table below). |
| `read` | bool | `true` | Whether to consult this cache on a local miss. |
| `write` | bool | `true` | Whether to push artifacts here after a local write. Writes happen on a background task — the build does not wait on the network. |
| `concurrency` | number | `10` | Maximum in-flight requests to this cache at once. |

Supported URI schemes:

| Scheme | Backend | Credentials |
|--------|---------|-------------|
| `s3://bucket/prefix` | Amazon S3 (and compatible) | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`, or instance role |
| `gs://bucket/prefix` | Google Cloud Storage | `GOOGLE_APPLICATION_CREDENTIALS` or ADC |
| `az://container/prefix` | Azure Blob Storage | `AZURE_STORAGE_ACCOUNT_NAME` + `AZURE_STORAGE_ACCESS_KEY` |
| `https://host/prefix` | Generic HTTP object store | — |
| `file:///path` | Local filesystem | — |

Run `heph tool cache measure-latency` to force a fresh latency measurement and
print per-cache round-trip times. See the [Remote cache guide](/docs/guides/remote-cache)
for a complete walkthrough.

## `fuse` — sandbox overlay

Controls whether sandboxes are assembled with a FUSE overlay instead of copying
inputs. It is opt-in.

:::warning
The FUSE overlay is in development and not yet fully functional. Leave it off
for production builds.
:::

```yaml title=".hephconfig2"
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

```yaml title=".hephconfig2"
lock:
  backend: fs   # fs (default) | mem
```

`fs` coordinates across processes via the filesystem; `mem` keeps the lock
in-process (useful for ephemeral or single-process runs).

## `telemetry` — usage reporting

heph collects anonymous, aggregate usage data to guide development. No target
addresses, file paths, labels, or any user-identifying information is ever
reported — only coarse facts like OS, architecture, version, command name, and
aggregate counters (targets resolved, cache hits, artifact count).

Telemetry is **on by default** (opt-out). To disable it, add to `.hephconfig2`:

```yaml title=".hephconfig2"
telemetry:
  enabled: false
```

You can also opt out via environment variable, which takes precedence over the
config file:

```sh
export HEPH_DISABLE_TELEMETRY=1
```

The environment variable is useful in CI pipelines or scripts where you do not
want to touch the config file.

| Key       | Type               | Default | Description |
|-----------|--------------------|---------|-------------|
| `enabled` | `true` \| `false`  | `true`  | Set to `false` to disable all reporting. |
