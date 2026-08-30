---
title: "Remote cache"
sidebar_position: 3
description: Share build artifacts across machines with a remote cache backed by S3, GCS, Azure, or any HTTP object store.
---

# Remote cache

A remote cache lets heph share build artifacts across machines. CI jobs and
developers with the same inputs get cache hits from artifacts another machine
already built — without re-executing.

## How it works

1. A machine builds a target and writes the artifacts to its local cache.
2. heph pushes those artifacts to the remote cache on a background task — the
   build's critical path does not wait on the network.
3. A second machine with the same inputs misses locally and checks the remote.
   A matching entry there is enough to call it a cache hit and skip
   re-executing — the actual output bytes download afterward, lazily, and
   only for the outputs something reads.

Uploads are best-effort: a remote failure logs a warning but never fails the
build. After three consecutive failures a cache is paused with an
exponential backoff, and automatically resumes on its own the next time a
request to it succeeds.

## Bucket layout

Objects are keyed by target address, so a bucket browses like the source
tree — inspecting it in the S3/GCS console shows which target owns which
artifact:

| Target | Object key |
|---|---|
| `//some/pkg:tgt` | `some/pkg/tgt/<inputhash>/out.tar` |
| `//some/pkg:tgt@v=linux,vp=arm64` | `some/pkg/tgt@v=linux,vp=arm64/<inputhash>/out.tar` |
| `//:root_tgt` | `root_tgt/<inputhash>/out.tar` |

`<inputhash>` is the target's input hash — the same value that drives local
cache hits.

Treat the layout as read-only: don't script against it, since it's not a
part of heph's stable API and can change between versions. If it does
change, existing objects are simply never read again — the next build
repopulates the cache under the new layout, no cleanup needed.

## Setting up S3

Add a `caches:` block to `.hephconfig`:

```yaml title=".hephconfig"
caches:
  shared:
    uri: s3://my-bucket/heph-cache
```

heph reads credentials from the environment using the standard AWS credential
chain — `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`, or an
instance/workload-identity role.

### Custom S3-compatible endpoints

Point an `s3://` cache at an S3-compatible service that isn't AWS — Cloudflare
R2, MinIO, Ceph — with `endpoint` and `region`. The URI still names the bucket
and prefix; `endpoint` names the host to talk to:

```yaml title=".hephconfig"
caches:
  shared:
    uri: s3://my-bucket/heph-cache
    endpoint: https://<account>.r2.cloudflarestorage.com
    region: auto
```

`endpoint` and `region` override the standard `AWS_ENDPOINT_URL` /
`AWS_REGION` environment variables when set. Both are `s3://`-only — setting
either on a `gs://`, `az://`, `https://`, or `file://` cache fails at startup
with the offending field and URI.

A plain `http://` endpoint (a local MinIO, a test double) is what opts that
cache into plaintext requests — heph otherwise refuses plaintext HTTP to a
remote cache. Writing `https://` never lifts that block:

```yaml title=".hephconfig"
caches:
  local:
    uri: s3://bucket/prefix
    endpoint: http://localhost:9000
```

## Setting up GCS

```yaml title=".hephconfig"
caches:
  shared:
    uri: gs://my-bucket/heph-cache
```

Credentials come from `GOOGLE_APPLICATION_CREDENTIALS` or Application Default
Credentials. In CI, a Workload Identity binding or a service account key file
both work.

## Scoping credentials to a cache

By default heph reads credentials from the ambient environment — the same
`AWS_ACCESS_KEY_ID` any other AWS tool on the machine uses. That's a problem
the moment the cache lives somewhere else: an `s3://` cache in Cloudflare R2
needs `AWS_ACCESS_KEY_ID` to hold an R2 key, which is then the wrong key for
any target that talks to real AWS. Two `s3://` caches in two different
accounts have the same conflict with each other.

heph also reads two heph-owned namespaces, checked most specific first, before
falling back to the ambient environment:

1. **This cache alone** — `HEPH_CACHE_<NAME>_*`, where `<NAME>` is the cache's
   key under `caches:`, uppercased with every character a shell can't spell
   replaced by `_`. `build-cache` becomes `HEPH_CACHE_BUILD_CACHE_*`.
2. **Every cache of this kind** — `HEPH_S3_*`, `HEPH_GCS_*`, `HEPH_AZURE_*`, or
   `HEPH_HTTP_*`, matching the cache's scheme.

The suffix is the same setting name the ambient variable uses, so the mapping
is mechanical: `HEPH_S3_ACCESS_KEY_ID` for `AWS_ACCESS_KEY_ID`,
`HEPH_S3_ENDPOINT_URL` for `AWS_ENDPOINT_URL`, `HEPH_GCS_SERVICE_ACCOUNT` for
`GOOGLE_SERVICE_ACCOUNT`, `HEPH_AZURE_ACCOUNT_NAME` for
`AZURE_STORAGE_ACCOUNT_NAME`. `HEPH_S3_AWS_ACCESS_KEY_ID` also works, if you'd
rather keep the vendor name.

Two caches, two accounts, one shell:

```yaml title=".hephconfig"
caches:
  r2:
    uri: s3://heph-cache/repo
    endpoint: https://<account>.r2.cloudflarestorage.com
  corp:
    uri: s3://corp-cache/repo
```

```bash title="terminal"
export HEPH_CACHE_R2_ACCESS_KEY_ID=...
export HEPH_CACHE_R2_SECRET_ACCESS_KEY=...
export HEPH_CACHE_CORP_ACCESS_KEY_ID=...
export HEPH_CACHE_CORP_SECRET_ACCESS_KEY=...
```

The most specific namespace that sets anything wins, and it wins outright —
heph never merges credentials from two sources for one cache. Setting
`HEPH_S3_ACCESS_KEY_ID` is enough to stop heph from reading
`AWS_SECRET_ACCESS_KEY` or `AWS_SESSION_TOKEN` from the ambient environment
for that cache, so set the matching secret in the same namespace too.

For GCS workload identity federation specifically, the scoped equivalent of
`GOOGLE_APPLICATION_CREDENTIALS` is `HEPH_GCS_APPLICATION_CREDENTIALS` (or
`HEPH_CACHE_<NAME>_APPLICATION_CREDENTIALS`).

:::note
An unrecognized variable name inside a `HEPH_*` namespace fails at startup,
naming the variable — heph assumes it's a typo rather than an unrelated
setting. Two caches whose names flatten to the same `HEPH_CACHE_<NAME>_`
namespace (`build-cache` and `build.cache`, for example) also fail at
startup, naming both.
:::

## Read-only and write-only caches

Set `read` or `write` to `false` to restrict what a cache does. A common
setup: CI writes, developers only read.

```yaml title=".hephconfig"
caches:
  shared:
    uri: s3://my-bucket/heph-cache
    read: true
    write: false   # developers read; CI writes
```

## Multiple caches

Configure more than one cache — for example a fast regional store and a
slower central one:

```yaml title=".hephconfig"
caches:
  regional:
    uri: s3://eu-bucket/heph-cache
  central:
    uri: s3://us-bucket/heph-cache
```

heph reads from the fastest cache first and writes to both. Latency is
measured once per process and persisted so subsequent runs skip the probe.

## Measuring latency

Force a fresh latency measurement and see per-cache round-trip times:

```bash title="terminal"
heph tool cache measure-latency
```

Output lists each cache, fastest first:

```
Remote cache latency (fastest first):
      1.23ms  [rw]  regional  (s3://eu-bucket/heph-cache)
     18.45ms  [rw]  central   (s3://us-bucket/heph-cache)
```

The `[rw]` flags show the configured `read`/`write` permissions. The order
is persisted and reused automatically until the cache definitions change.

## Excluding targets from the remote cache

Some targets produce outputs that embed host-local paths — a wrapper script
that references an absolute path in a local toolchain store, for example.
Sharing those artifacts causes another machine to pull a wrapper that points
at a path it doesn't have, which fails at run time.

Set `cache = {"remote": False}` on those targets. Local caching stays on;
heph will never upload the artifact to or download it from a remote cache:

```python title="BUILD"
target(
    name = "local-wrapper",
    driver = "exec",
    run = ["./gen-wrapper.sh"],
    out = "wrapper.sh",
    cache = {"remote": False},
)
```

Every machine builds its own copy and caches it locally. Targets that depend
on it get a local hit on the same machine; other machines build their own copy
on first use.

## In CI

A typical CI setup: grant write access to CI runners and read access
everywhere. The cache fills on every merged build and keeps subsequent runs
fast for the whole team.

```bash title="terminal"
heph run //... --no-tui
```

No extra flags needed — heph reads and writes the remote automatically when
`caches:` is configured.

See [Using heph in CI](/docs/guides/ci) for the broader CI setup, and
[`caches` in the configuration reference](/docs/reference/configuration#caches--remote-shared-caches)
for the full set of options.
