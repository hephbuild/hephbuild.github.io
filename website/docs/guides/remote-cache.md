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
3. A second machine with the same inputs misses locally, pulls the artifacts
   from the remote, and returns them as a cache hit without re-executing.

Uploads are best-effort: a remote failure logs a warning but never fails the
build. After three consecutive failures a cache is skipped for the rest of
the run.

## Setting up S3

Add a `caches:` block to `.hephconfig2`:

```yaml title=".hephconfig2"
caches:
  shared:
    uri: s3://my-bucket/heph-cache
```

heph reads credentials from the environment using the standard AWS credential
chain — `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`, or an
instance/workload-identity role.

## Setting up GCS

```yaml title=".hephconfig2"
caches:
  shared:
    uri: gs://my-bucket/heph-cache
```

Credentials come from `GOOGLE_APPLICATION_CREDENTIALS` or Application Default
Credentials. In CI, a Workload Identity binding or a service account key file
both work.

## Read-only and write-only caches

Set `read` or `write` to `false` to restrict what a cache does. A common
setup: CI writes, developers only read.

```yaml title=".hephconfig2"
caches:
  shared:
    uri: s3://my-bucket/heph-cache
    read: true
    write: false   # developers read; CI writes
```

## Multiple caches

Configure more than one cache — for example a fast regional store and a
slower central one:

```yaml title=".hephconfig2"
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
