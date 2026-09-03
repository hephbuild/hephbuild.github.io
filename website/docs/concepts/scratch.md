---
title: "Scratch caches"
sidebar_position: 7
description: A named, mutable cache directory a target keeps between runs — for a compiler cache, a download cache, or any tool that maintains its own cache.
---

# Scratch caches

A **scratch** is a directory a target declares, keeps between runs, and
shares with every other target that references it. It is the one thing
inside a [sandbox](/docs/concepts/sandbox) that is neither an input nor an
output — mutable, and never hashed.

## The contract

> A target's outputs must be identical whether its scratch directories are
> warm, cold, or absent. Losing one is always a slowdown, never a wrong
> answer.

heph gives every other part of a target's inputs and outputs the hermetic
treatment: declared in, declared out, sandbox thrown away. A scratch is the
deliberate exception, for a tool that already maintains its own
content-addressed cache — a compiler cache, a package download cache, a
registry blob store. Because it never enters the
[input hash](/docs/concepts/caching), it can never invalidate anything:
changing a scratch's settings rebuilds nothing, and deleting one costs time
and nothing else.

Check the contract on your own target:

```bash title="terminal"
heph inspect hashout //build:compile
heph --no-scratch inspect hashout //build:compile
```

Same hash both times, or the target depends on carried-over state and is
broken.

## Declaring one

A scratch is declared like any other target, with `driver = "scratch"`. It
builds nothing — it only describes a cache.

```python title="BUILD"
target(
    name    = "gocache",
    driver  = "scratch",
    path    = ".cache/go-build",   # optional; omit for env-var-only
    env     = "GOCACHE",           # defaults to SCRATCH_<NAME>
    access  = "shared",            # "exclusive" (default) | "shared"
    version = "",                  # what the contents depend on, beyond the addr
    remote  = False,               # may travel through the remote cache
)

target(
    name    = "build",
    driver  = "bash",
    scratch = ["//build:gocache"],
    run     = "go build -o $OUT ./...",
    out     = "bin",
)
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `path` | `string` | unset | Where the directory mounts inside a consuming target's sandbox, relative to its cwd. Optional — most tools find their cache through an environment variable, and omitting `path` is the safer shape: with nothing mounted, no output can collect the directory and no dependency can be shadowed by it. |
| `env` | `string` | `SCRATCH_<NAME>` | Environment variable a consumer reads the directory's absolute path from. Point it at the tool's own variable (`GOCACHE`, `CCACHE_DIR`) so nothing else needs wiring. |
| `access` | `string` | `"exclusive"` | `"exclusive"` — one consumer at a time, enforced across separate `heph` processes too; the safe default for a tool with no stated concurrency story. `"shared"` — concurrent consumers allowed, only for a cache that's safe under concurrent access *by construction* (content-addressed and self-verifying, the way Go's build cache is). |
| `version` | `string` | `""` | Everything the contents depend on, beyond the address — the whole of it. Two declarations at the same address share a directory if and only if they also agree on `version`. heph never guesses: state what the cache depends on, or leave it empty for a cache that's portable everywhere. See [Portability with `version`](#portability-with-version). |
| `remote` | `bool` | `false` | Whether this cache may be pulled from a remote cache automatically, and published to it with `heph tool scratch push`. See [Sharing through the remote cache](#sharing-through-the-remote-cache). |
| `max_size` | `string` | unset | A size cap, e.g. `"10GiB"`. Past it, the whole cache is dropped and starts again — heph can't tell which of a foreign tool's entries are hot, so it doesn't try to trim. |

Reference a declaration from a consuming target with `scratch = [...]` — a
plain list of addresses, the same shape as `deps`. A target may reference
several; every target referencing the same declaration gets the same
directory.

## Choosing `access`

`access` is an assertion about the tool, not a wish — get it wrong and
`"shared"` corrupts the cache, or `"exclusive"` serializes work that didn't
need to be. Go's build cache and module cache are safe under concurrent
writers because they're content-addressed: an entry either matches its key
or is not used, the same property `go build -p N` already relies on. Most
tools don't document that, so `"exclusive"` — one consumer at a time,
enforced with a lock held for the whole run — is the default.

## Portability with `version`

`version` is opaque to heph — it isn't parsed, and heph contributes nothing
of its own to it (no host OS, no architecture) unless the BUILD file puts it
there:

```python title="BUILD"
version = heph.core.os() + "/" + heph.core.arch()   # host-specific
version = goos + "/" + goarch + "/" + go_version     # target-specific
version = ""                                         # portable (the default)
```

The default is empty, which is the *less* safe direction, deliberately — a
narrow default that guesses wrong (keying on the host for contents that
actually depend on the target) is worse than an obviously-too-broad one.
Changing `version` yields a fresh, empty cache without touching anything
else.

## Auditing with `--no-scratch`

`--no-scratch` runs against a throwaway, empty cache instead of the stored
one — proving the contract rather than assuming it. It implies `--force`:
since a scratch never enters the cache key, a cache hit would otherwise just
replay the answer the audit exists to check. The stored cache itself is
never touched.

```bash title="terminal"
heph run --no-scratch //build:compile
```

A target that reads an unset scratch variable under `set -u` fails outright
rather than running cold — write `${GOCACHE:-}` if the audit should report
on the target instead of on the shell.

## Sharing through the remote cache

With a [remote cache](/docs/reference/configuration#caches--remote-shared-caches)
configured, `remote = True` lets a scratch's contents travel between
machines. A build pulls automatically on a cold cache; nothing is ever
published as a side effect of building — that's always an explicit step, so
CI runs it last:

```bash title="terminal"
heph tool scratch push --all --producer "$CI_RUN_ID"   # publish every remote = True cache
heph tool scratch pull --all                            # warm a machine ahead of time
```

Which lineage a run reads and writes is controlled by `scratch.scope` in
`.hephconfig` — see
[`scratch` — branch-lineage policy](/docs/reference/configuration#scratch--branch-lineage-policy).
By default every run shares one lineage; scope it per branch so work on one
branch doesn't overwrite another's cache, and a fresh branch starts from its
base instead of from nothing.

## Inspecting and reclaiming

```bash title="terminal"
heph tool scratch ls                       # every cache: address, access, size, lineages present
heph tool scratch head //build:gocache     # why a build would be warm or cold
heph tool scratch path //build:gocache     # the on-disk directory
heph tool scratch rm //build:gocache       # drop one; always safe
heph tool scratch rm --all                 # drop every scratch cache
```

`heph tool scratch head` is the one worth remembering: it prints every
candidate lineage a build would consult, local and remote, in order, and
which one wins — the answer to "why did my branch start cold?", a question
the directory itself can't answer since the interesting part is what
*wasn't* found.

Scratch caches also come under `heph tool gc`:

```bash title="terminal"
heph tool gc --scratch-max-size 50GiB --scratch-max-age-days 30
```

## A broad output beside a mounted scratch

A target's own outputs must never come from inside its scratch — that would
make the artifact's bytes depend on unhashed, mutable state. Give a mounted
scratch (one with `path` set) a narrow `out` pattern in the same directory:
a glob broad enough to reach the mount (`out = "**/*"`, say) fails when heph
packs the result, naming the mount path in the error.

An unmounted scratch (no `path`, the env-var-only form) sidesteps this
entirely — there's nothing in the sandbox tree for an output to reach, which
is why it's the shape to reach for first when a tool is happy to be told its
cache directory through an environment variable alone.

## Who uses one already

The [Go plugin](/docs/plugins/go#build-and-module-caches) shares one
`GOCACHE` per module and per build variant, and one portable `GOMODCACHE`
for downloaded modules, both without any configuration.

The [OCI plugin](/docs/plugins/oci#oci_pull)'s `oci_pull` shares one
registry blob store across every pull in the workspace — two images sharing
a base layer download it once, not once per pull.
