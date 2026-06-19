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
plugins:
  - builtin: buildfile
  - builtin: bash
```

## Pinning the version

```yaml title=".hephconfig"
version: v1.2.3
```

`version` pins the heph release for this workspace so every machine and CI job
runs the same binary. When the running binary differs from the pin, heph
automatically downloads the pinned release and re-execs into it on startup —
the rest of the run is served by the pinned version. The downloaded binary is
cached in `~/.heph/versions/<tag>/` and reused on subsequent runs.

Only **exact** version pins (`v1.2.3`) are supported. Constraint expressions
(`>=1.2, <2`, `^1.0`, …) are recognized but not yet acted on — heph logs a
warning and continues with the currently installed binary. A failed download is
also non-fatal: heph warns and continues.

To disable automatic self-upgrade for a process tree, set `HEPH_NO_SELF_UPDATE`
to any non-empty value:

```sh
export HEPH_NO_SELF_UPDATE=1
heph run //...
```

This is useful in sandboxed environments or where you manage toolchains
yourself.

## Keys

Every key below is optional.

| Key         | Type                          | Default | Description |
|-------------|-------------------------------|---------|-------------|
| `version`   | string                        | unset   | Pins the heph release for this workspace. When set, heph automatically downloads and re-execs into the pinned version on startup. See [Pinning the version](#pinning-the-version). |
| `plugins`   | list of plugin entries        | `[]`    | Plugins to register. Each entry sets exactly one of `builtin`, `path`, or `url`, plus an optional `options` map and, for `url:` entries, an optional `checksum`. |
| `homeDir`   | path                          | unset   | Where heph keeps its home and cache. |
| `fs`        | `{skip: string[]}`            | `{}`    | Workspace-wide ignore patterns shared with all tree-walking plugins. |
| `memCache`  | `{perEntryBytes, capacityBytes}` | unset | In-memory cache sizing. |
| `cache`     | `{spillThresholdBytes: number}` | `{}`  | Durable local-cache tuning. |
| `caches`    | map of `{uri, read, write, concurrency}` | `{}` | Named remote (shared) caches. |
| `fuse`      | `{enabled: true \| false \| "auto"}` | off | Sandbox overlay mode. |
| `lock`      | `{backend: fs \| mem}`        | `fs`    | Execute-phase lock backend. |
| `telemetry` | `{enabled: true \| false}`    | `{}`  (enabled) | Anonymous usage reporting. Set `enabled: false` to opt out. |

## Registering plugins

`plugins` is a list of entries. Each entry must set exactly one of:

| Key       | Loads |
|-----------|-------|
| `builtin` | A compiled-in plugin by name (e.g. `buildfile`, `exec`). |
| `path`    | A local `*-plugin.json` manifest (relative to the workspace root, or absolute). |
| `url`     | A remote `*-plugin.json` manifest — downloaded and cached in `~/.heph/plugins/`. |

Each entry also accepts an optional `options` map passed to that plugin:

```yaml title=".hephconfig"
plugins:
  - builtin: buildfile
    options:
      patterns: [BUILD, "*.BUILD"]
  - builtin: exec
    options:
      path:
        - /usr/local/bin
        - /usr/bin
        - /bin
  - path: ./path/to/my-plugin.json
    options:
      some_option: value
```

`url:` entries also accept a `checksum` field to pin the downloaded manifest — see [Pinning manifests with checksums](#pinning-manifests-with-checksums).

The keys allowed inside `options` are defined by each plugin — see its page
(for example [Buildfile](/docs/plugins/buildfile), [Exec](/docs/plugins/exec),
[Go](/docs/plugins/go)). The engine only wires plugins together; it does not
interpret their options.

:::note
Some plugins are built-in and always available (`group`, `fs`, `hostbin`,
`query`); others must be listed here before a target can use them. Each plugin
page states which.
:::

### External plugins (`path:` and `url:`)

An external plugin ships as a shared library (cdylib) paired with a
`*-plugin.json` manifest. The manifest names the plugin and lists per-platform
library artifacts; heph picks the right one for the current host.

`path:` points at a manifest on disk (relative to the workspace root, or
absolute, or `~/`-prefixed). `url:` fetches the manifest from a URL; the
downloaded manifest and library are cached in `~/.heph/plugins/<os>-<arch>/`
and reused on subsequent runs.

```yaml title=".hephconfig"
plugins:
  # Local manifest on disk
  - path: ./path/to/my-plugin.json

  # Remote manifest — downloaded and cached automatically
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/<HEPH_VERSION_URL>/heph-go-plugin.json
```

`path:` and `url:` plugins are supported on Unix only.

### Pinning manifests with checksums

A `url:` entry accepts an optional `checksum` field that pins the SHA-256 of
the downloaded manifest. heph verifies the manifest against this digest before
trusting anything it declares — a mismatch is a hard error.

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/<HEPH_VERSION_URL>/heph-go-plugin.json
    checksum: sha256:<hex>
```

The checksum is published alongside each manifest as a `<manifest>.sha256`
sidecar file (e.g. `heph-go-plugin.json.sha256`). Copy the value from that
sidecar into `checksum:` to lock the manifest to a known-good digest.

The field anchors a **trust chain**: the config pins the manifest → the manifest
pins each per-host artifact (cdylib) with its own `checksum` entry → the loaded
binary is verified. Both levels must pass before any plugin code runs.

| Format | Meaning |
|--------|----------|
| `sha256:<hex>` | SHA-256 digest in lowercase hex. The only supported algorithm. |

`checksum` is optional. Omitting it skips manifest verification; per-artifact
checksums embedded in the manifest still apply when present. `checksum` is only
valid for `url:` entries — `builtin:` and `path:` entries reject it.

## `fs` — workspace ignore patterns

`fs.skip` is a list of workspace-root-relative patterns shared with every
tree-walking plugin — the `fs` plugin, the `buildfile` provider, and the `go`
provider. Patterns in this list apply everywhere at once, unlike per-plugin
`skip` options which affect only one provider.

```yaml title=".hephconfig"
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

The `buildfile` and `go` plugins each accept their own `skip` option (under
`options.skip` on their respective `plugins:` entry). Those apply only to the
respective plugin.

`fs.skip` is global: the engine merges it with every plugin's own `skip` list
before building the final ignore set, so the same path is pruned consistently
across every plugin.

Use `fs.skip` for workspace-wide exclusions (e.g. `vendor`, `node_modules`,
generated output trees). Use per-plugin `skip` for patterns that should only
affect one provider.

## `memCache` — in-memory cache

Bounds the cache heph keeps in memory for the current run.

```yaml title=".hephconfig"
memCache:
  perEntryBytes: 16384      # largest single entry kept in memory
  capacityBytes: 67108864   # total budget; 0 disables the in-memory cache
```

## `cache` — local cache storage

Controls how heph stores artifacts in the durable on-disk cache.

```yaml title=".hephconfig"
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

```yaml title=".hephconfig"
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

## `telemetry` — usage reporting

heph collects anonymous, aggregate usage data to guide development. No target
addresses, file paths, labels, or any user-identifying information is ever
reported — only coarse facts like OS, architecture, version, command name, and
aggregate counters (targets resolved, cache hits, artifact count).

Telemetry is **on by default** (opt-out). To disable it, add to `.hephconfig`:

```yaml title=".hephconfig"
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

## Profiles — layered config overlays

Set the `HEPH_PROFILES` environment variable to a comma-separated list of
profile names to layer additional config files on top of `.hephconfig`:

```bash
HEPH_PROFILES=ci heph run //...
```

For each name in the list, heph loads `<name>.hephconfig` from the workspace
root and merges it over the accumulated config in order. `HEPH_PROFILES=a,b`
loads the base `.hephconfig`, then applies `a.hephconfig`, then
`b.hephconfig` — each merged over the result of the previous step.

A profile file that is missing or has invalid YAML is a hard error.

### Merge rules

| Config section | Behavior |
|----------------|----------|
| Scalar fields (`homeDir`, `lock`, `fuse`, `telemetry`, …) | Profile value wins when present; base value is kept when absent. |
| `caches` | Deep-merged by cache name. A profile can patch individual fields (e.g. flip `write`) while inheriting the rest of the entry from the base. |
| `plugins` | Merged by identifier (`builtin`/`path`/`url` value). A matching entry is replaced in place; new ones are appended, preserving order. |

### Disabling remote cache writes locally

The base config enables a shared cache for everyone. A `dev` profile turns off
writes so local machines read from the cache without polluting it:

```yaml title=".hephconfig"
caches:
  shared:
    uri: s3://my-bucket/heph-cache
    read: true
    write: true
```

```yaml title="dev.hephconfig"
caches:
  shared:
    write: false   # inherit uri and read from the base
```

```bash
HEPH_PROFILES=dev heph run //...
```

### CI-specific settings

A `ci` profile can override any key — here disabling telemetry and ensuring
the shared cache is writable:

```yaml title="ci.hephconfig"
telemetry:
  enabled: false
caches:
  shared:
    write: true
```

Activate it in your workflow:

```yaml title=".github/workflows/build.yml"
env:
  HEPH_PROFILES: ci
```

See the [CI guide](/docs/guides/ci) for a full CI setup.
