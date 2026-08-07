---
title: "OCI"
sidebar_position: 13
description: Build, assemble, pull, push, and load OCI/Docker container images — with or without a Dockerfile, with or without a daemon.
---

# OCI

The OCI plugin builds and moves container images. `docker_build` builds one
from a Dockerfile with `docker buildx`; `oci_image` assembles one directly
from target outputs, with no Dockerfile, no daemon, and nothing executed.
`oci_pull`, `oci_push`, and `oci_load` move an image between a registry,
heph's cache, and a local docker daemon. `oci_index` groups images built
separately, one per platform, into a single multi-platform image.

## Driver

A **driver** is the component that knows how to execute a target's action.
This plugin registers seven drivers: `docker_build`, `oci_image`,
`oci_layer`, `oci_index`, `oci_pull`, `oci_push`, and `oci_load`.

## Enabling it

The OCI plugin is an **external plugin** — it is not compiled into the heph
binary. It ships as a shared library (cdylib) with a manifest file
(`heph-oci-plugin.json`) and takes no options.

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-oci-plugin.json
    checksum: sha256:<hex>   # optional; pin from heph-oci-plugin.json.sha256
```

The `checksum` field is optional but recommended — it pins the manifest to a
known digest so a tampered or misdelivered manifest is rejected before
loading. See [Pinning manifests with checksums](/docs/reference/configuration#pinning-manifests-with-checksums)
for details.

## Building an image

Two drivers build an image. Pick by whether the image needs to run a command.

| Driver | Use when | Needs |
|---|---|---|
| [`docker_build`](#docker_build) | The image needs a `RUN` step — installing packages, compiling, a multi-stage build. | A running docker daemon and a `docker buildx` builder that can export to a file. |
| [`oci_image`](#oci_image-and-oci_layer) | The image is a base plus files on top — a static binary, a few assets. Nothing needs to execute. | Nothing. No daemon, no `docker` binary, no execution of any kind. |

Prefer `oci_image` when it fits. Its cache key covers everything that can
change the image: there is no base resolved from the network at build time,
no un-hashed toolchain version, no secret value that can't be hashed. It also
cross-builds for free — assembling a `linux/arm64` image on an `amd64` machine
needs no emulation, because nothing runs. `docker_build` is the escape hatch
for a real build step, at the cost of leaving some of those factors outside
the cache key — see [What `docker_build` does not hash](#what-docker_build-does-not-hash).

### `docker_build`

```python title="BUILD"
target(
    name = "img",
    driver = "docker_build",
    dockerfile = "Dockerfile",
    context = [":srcs"],
    build_args = {"VERSION": "1.2.3"},
    platforms = ["linux/amd64", "linux/arm64"],
)
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dockerfile` | `string` | `"Dockerfile"` | The Dockerfile, as either a **target address** or a path. An address (starting with `:` or `//`) makes the target that produces it a dependency, hashed on its own. A path is relative to the target's package and must be produced by a `context` dependency (a plain checked-in `Dockerfile` comes from the [Filesystem](./fs.md) provider). Absolute paths are rejected. |
| `context` | list or dict of `string` → target addresses | `{}` | Build-context dependencies. A bare list is the default group, exported to the build as the `SRC` build arg; a dict names groups, each exported as `SRC_<GROUP>` (context-relative paths of that group's outputs). Group names are uppercased and non-alphanumerics become `_`. |
| `context_by_platform` | dict of platform → (list or dict as `context`) | `{}` | Context dependencies that differ **per platform**, keyed `"os/arch"` — e.g. `{"linux/amd64": {"bin": [":bin_amd64"]}, "linux/arm64": {"bin": [":bin_arm64"]}}`. One buildx invocation builds every platform from one context, so a dependency that differs by architecture (a cross-compiled binary, for example) can't go in `context` — it stages under a per-platform prefix instead, and the Dockerfile selects with BuildKit's `TARGETPLATFORM` build arg. Group names must not collide with `context`; every platform in `platforms` needs an entry and vice versa; requires `platforms` to be set explicitly. |
| `bases` | dict of `string` → target address | `{}` | Base images, by build-context name → a single `oci_pull(layout = True)` (or `oci_image`/`docker_build`) target. Wired to `docker buildx --build-context <name>=…`, so the Dockerfile does `FROM <name>` (and can `COPY --from=<name>` for multi-stage). A multi-platform build needs the base pulled with `all_platforms = True` too. |
| `format` | `string` | `"oci"` | Archive format: `oci` or `docker`. |
| `build_args` | dict of `string` → `string` | `{}` | `--build-arg` values. Hashed — they change the image. A key may not contain `=`. |
| `stage` | `string` | unset | Build a specific stage (`--target`) of a multi-stage Dockerfile — the name in `FROM … AS <stage>`. Named `stage` rather than buildx's `target`, since a heph *target* is a different thing. |
| `out` | `string` | `<target name>.tar` | Output archive filename, relative to the target's package. Must be a bare filename. |
| `platforms` | `string[]` | the builder's own default | Target platforms (`--platform`), e.g. `["linux/amd64", "linux/arm64"]`. Left empty, the builder's default platform is resolved at parse time (`docker buildx inspect --bootstrap`) and folded into the cache key, so an arm64 laptop and an amd64 CI runner don't compute the same key for different images. A multi-platform build needs a container-driver builder — see [The builder](#the-builder) — the default daemon builder only builds one platform, and `format = "docker"` can't hold more than one image at all. |
| `builder` | `string` | buildx's current builder | The `docker buildx` builder to build on (`--builder`). A hashed input — and the reason `BUILDX_BUILDER` is stripped from the build's environment: what matters is the *name* written here, not whatever the host happens to have selected. |
| `secrets` | `string[]` | `[]` | BuildKit build secrets, as raw `--secret` specs, e.g. `["id=token,env=TOKEN"]`, consumed in the Dockerfile via `RUN --mount=type=secret`. The spec **string** is hashed; the secret's *value* is not (and cannot be). `src=` sources are rejected — they'd resolve against a working directory outside the sandbox; use `env=`, or stage the file through `context`. |
| `ssh` | `string[]` | `[]` | SSH forwarding, as raw `--ssh` specs, e.g. `["default"]`, consumed via `RUN --mount=type=ssh`. Same hashing caveat and `src=` restriction as `secrets`. |
| `cache_from` | `string[]` | `[]` | BuildKit `--cache-from` refs, e.g. `["type=registry,ref=reg/img:cache"]`. A build optimization, excluded from the input hash — never busts the heph cache. |
| `cache_to` | `string[]` | `[]` | BuildKit `--cache-to` refs, e.g. `["type=registry,ref=reg/img:cache,mode=max"]`. Also excluded from the input hash. |
| `cache` | bool or dict | both tiers on | Caching for the built archive. See [Cache control](#cache-control). |

Two output groups: the default group (`""`) is the archive; `digest` is a
plain-text file holding the built image's digest, for a downstream target to
read without unpacking the archive:

```python title="BUILD"
target(
    name = "deploy",
    driver = "bash",
    deps = {"digest": "//app:img|digest"},
    run = "envsubst < manifest.tmpl.yaml > $OUT",
    out = "manifest.yaml",
)
```

#### The builder

`docker_build` needs `docker buildx` with a builder that can **write an image
archive to a file**. The plain `docker` driver — what a stock Docker Engine
selects by default — cannot: `--output type=oci,dest=…` and
`type=docker,dest=…` both fail on it, and with them every `docker_build`
target regardless of `format`. Either turn on the daemon's containerd image
store, or create a container-driver builder and name it:

```console title="terminal"
$ docker buildx create --name heph --driver docker-container
```

```python title="BUILD"
target(name = "img", driver = "docker_build", builder = "heph", ...)
```

Multi-platform builds have the same requirement, plus a container-driver
builder specifically — the default daemon builder only builds one platform at
a time.

#### What `docker_build` does not hash

`docker_build`'s cache key covers the build context, Dockerfile, build args,
stage, platforms, and base-image contexts — an unchanged context is a cache
hit, and the archive is served from cache without rebuilding. It does **not**
cover everything that can change the resulting image bytes:

- **`FROM` base images** not passed through `bases`. BuildKit resolves a plain
  `FROM alpine:3.20` itself, from the network — whatever that tag pointed at
  when the machine that populated the cache last resolved it. Pin `FROM` by
  `@sha256:`, or pull the base with [`oci_pull`](#oci_pull) and wire it
  through `bases`, which *is* a hashed input.
- **Anything `RUN` fetches** — `apt-get`, `curl`, `npm ci`. Execution-time
  downloads are neither content-addressed nor verified.
- **Secret and SSH *values***. The spec strings are hashed; what the agent or
  environment actually hands the build is not.
- **The host `docker` / `buildx` version.** BuildKit changes output-visible
  defaults across releases (attestations, compression), so two machines on
  different versions can produce different archives from an identical cache
  key.
- **`.dockerignore`.** Nothing stages one, so unless a `context` target
  produces it the build sees none — a heph-built image can differ from the
  same `docker build` run by hand in the repo.

The build's environment is not on this list: every `docker_build` runs with a
cleared environment and an explicit passthrough allowlist, so a stray
`BUILDX_BUILDER` or `SOURCE_DATE_EPOCH` on the host cannot change the build
behind the cache key's back.

### `oci_image` and `oci_layer`

`oci_layer` turns target outputs into one image layer — a tar of a file tree,
nothing executes. `oci_image` stacks `oci_layer` targets on an optional base
into a built image. Splitting the two means a big shared layer (static
assets, a CA bundle) is built and cached once and reused by every image that
lists it.

```python title="BUILD"
target(
    name = "bin_layer",
    driver = "oci_layer",
    srcs = [":server"],
    prefix = "/usr/bin",
)

target(
    name = "img",
    driver = "oci_image",
    base = ":base_alpine",   # an oci_pull(layout = True) target
    layers = [":bin_layer"],
    entrypoint = ["/usr/bin/server"],
    platforms = ["linux/amd64", "linux/arm64"],
)
```

#### `oci_layer` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `srcs` | `string[]` | `[]` | Targets whose files go into this layer, at their workspace-relative path, rewritten by `strip` and `prefix`. A `srcs` that produces no files is an error, not an empty layer — an image missing its binary would otherwise build, push, and start, and only fail when something tries to run it. |
| `prefix` | `string` | **required** | Where the files land inside the image, e.g. `"/usr/bin"`. Required deliberately — a default of `/` (files at their workspace-relative path, e.g. `/cmd/server/bin`) is never what anyone wants, and would fail silently at `docker run` time instead of at build time. |
| `strip` | `string` | unset | A leading workspace-relative path to drop before applying `prefix` — e.g. `strip = "cmd/server"` puts `cmd/server/bin` at `<prefix>/bin`. A `strip` that matches nothing is an error, not a silent no-op. |
| `mode` | `string` (octal) | `"0755"` for executable files, `"0644"` otherwise | File mode as an octal string, e.g. `"0755"`. A string because Starlark has no octal literal — `mode = 755` would silently mean decimal 755. Setuid, setgid, and the sticky bit are rejected: heph's artifact hash records only the executable bit, so those permissions can't survive a rebuild from cache. |
| `cache` | bool or dict | both tiers on | Caching for the layer tar. See [Cache control](#cache-control). |

A layer's bytes are written to be reproducible regardless of the host: file
timestamps, uid, and gid are zeroed; entries are sorted by path; symlinks are
preserved (never followed); and the layer is written uncompressed.

#### `oci_image` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `base` | `string` | unset | Base image — an `oci_pull(layout = True)` (or another `oci_image`) target. Omitted, the image starts from scratch. This target's layers go on top; the base's config (`Env`, `Entrypoint`, `Cmd`, `User`, `WorkingDir`, `Labels`, `ExposedPorts`) is inherited, and anything set below wins. A multi-platform build needs a base with an instance per platform: `oci_pull(layout = True, all_platforms = True)`. |
| `layers` | `string[]` | `[]` | `oci_layer` targets, bottom to top. Order matters — a later layer's file shadows the same path in an earlier one. |
| `layers_by_platform` | dict of platform → `string[]` | `{}` | Layers that differ per platform, appended after `layers`. Every platform in `platforms` needs an entry and vice versa — a missing one would silently ship an image without its binary for that platform. |
| `platforms` | `string[]` | **required** | Target platforms, e.g. `["linux/amd64", "linux/arm64"]`. No default: `platforms` is a label written into the image config with nothing relating it to `layers`, so defaulting to the host's architecture would let an `amd64` laptop and an `arm64` CI runner build different images from one BUILD file, or let an `amd64` binary ship inside a config claiming `arm64` — an `exec format error` at run time, correctly cached, with no build-time error. |
| `entrypoint` | `string[]` | `[]` | The image's entrypoint (`ENTRYPOINT`). Setting it clears any `cmd` inherited from the base, mirroring a Dockerfile's `ENTRYPOINT`. |
| `cmd` | `string[]` | `[]` | The image's default arguments (`CMD`). |
| `env` | dict of `string` → `string` | `{}` | Environment variables, merged over the base's by name. |
| `user` | `string` | unset | The user to run as (`USER`), e.g. `"65532:65532"`. |
| `workdir` | `string` | unset | The working directory (`WORKDIR`). |
| `labels` | dict of `string` → `string` | `{}` | Image labels, merged over the base's. |
| `exposed_ports` | `string[]` | `[]` | Ports the image declares (`EXPOSE`), e.g. `["8080/tcp"]`. |
| `format` | `string` | `"oci"` | Archive format: `oci` or `docker`. |
| `layout` | `bool` | `false` | Write an OCI **layout directory** instead of a single archive file — the shape another image's `base`, and `docker_build`'s `bases`, consume. |
| `out` | `string` | `<target name>.tar`, or `.oci` with `layout = True` | Output filename (or directory name), relative to the target's package. Must be a bare name. |
| `cache` | bool or dict | both tiers on | Caching for the built image. See [Cache control](#cache-control). |

Like `docker_build`, `oci_image` has a default output group (the
archive/layout) plus a `digest` group holding the image digest as text.

## Multi-platform images

`docker_build(platforms = [...])` and `oci_image(platforms = [...])` build
every platform from one recipe — one Dockerfile (or one set of layers), with
per-platform differences limited to `context_by_platform` /
`layers_by_platform`. When the platforms genuinely need different recipes — a
different base, a different package manager, a stage that only exists on one
architecture — build them as separate targets and group the results with
`oci_index`.

```python title="BUILD"
target(
    name = "amd64",
    driver = "docker_build",
    dockerfile = "Dockerfile.amd64",
    context = [":srcs"],
    platforms = ["linux/amd64"],
)

target(
    name = "arm64",
    driver = "docker_build",
    dockerfile = "Dockerfile.arm64",
    context = [":srcs"],
    platforms = ["linux/arm64"],
)

target(
    name = "img",
    driver = "oci_index",
    images = [":amd64", ":arm64"],
)
```

`//pkg:img` is then one image everywhere downstream: `oci_push` sends the
whole manifest list under one tag, `oci_load` picks the instance for the
host, and `docker_build`'s `bases` resolves the right platform out of it.

Nothing is rebuilt or re-hashed by `oci_index` — it reads the layouts its
inputs already produced and writes one index over them, copying blobs by
reference. Each input still caches on its own inputs, so changing the arm64
Dockerfile doesn't rebuild amd64.

### `oci_index` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `images` | `string[]` | **required** | The images to group, one per platform — `docker_build`, `oci_image`, `oci_pull`, or another `oci_index` target. Each contributes every instance it holds, so grouping two single-platform builds is the common case, but a multi-platform input is merged rather than rejected. Two inputs claiming the same platform is an error. |
| `format` | `string` | `"oci"` | `docker` is rejected — a docker-format archive holds a single image, which is the one thing this rule doesn't produce. |
| `layout` | `bool` | `false` | Write an OCI **layout directory** instead of a single archive file. |
| `out` | `string` | `<target name>.tar`, or `.oci` with `layout = True` | Output filename (or directory name), relative to the target's package. Must be a bare name. |
| `cache` | bool or dict | both tiers on | Caching for the grouped image. See [Cache control](#cache-control). |

## Moving images

### `oci_pull`

Pulls an image from a registry into a cacheable archive output — the
image-world analogue of [HTTP Fetch](./http-fetch.md): bytes come from the
network, not from other targets, and the pulled archive is a cacheable
target output, so a base image shared by many `docker_build` or `oci_image`
targets is pulled once and served from cache thereafter.

```python title="BUILD"
target(
    name = "alpine",
    driver = "oci_pull",
    ref = "alpine:3.20",
    layout = True,
)
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ref` | `string` | **required** | Source image reference, e.g. `docker.io/library/alpine:3.20` or, pinned, `alpine@sha256:…`. |
| `layout` | `bool` | `false` | Write an OCI **layout directory** instead of a single archive file — the shape `docker_build`'s `bases` and another image's `base` consume. Without it the pulled archive can only be pushed or loaded. |
| `platforms` | `string[]` | Linux on the host's architecture | Which platforms to pull out of a multi-platform manifest list, as `"os/arch"`. One entry selects one instance; several keep an index holding exactly those. Always part of the cache key. Mutually exclusive with `all_platforms`. |
| `all_platforms` | `bool` | `false` | Pull **every** instance of the manifest list instead of naming them, keeping the whole index. This is what a base for a multi-platform `docker_build`/`oci_image` needs. |
| `out` | `string` | `<target name>.tar`, or `.oci` with `layout = True` | Output filename (or directory name), relative to the target's package. Must be a bare name. |
| `insecure` | `bool` | `false` | Pull from an insecure (HTTP / self-signed) registry: plain HTTP, certificate validation off. |
| `cache` | bool or dict | both tiers on | Caching for the pulled archive. A pull is content-addressed only when `ref` is digest-pinned. See [Cache control](#cache-control). |

The platform is always resolved to a concrete `os/arch` and always hashed,
even when `platforms` is left at its default — leaving it implicit would make
an arm64 and an amd64 machine share one cache entry for two different images,
and would fail outright on macOS, where there's no `darwin` instance to pull
from a Linux image.

#### Pinning for reproducibility

heph caches a pull on the **ref string**, not on registry content — a
`docker.io/library/alpine:3.20` moving to point at new bytes still serves the
stale, already-cached archive. Pin by digest for a reproducible pull:

```python title="BUILD"
target(
    name = "alpine",
    driver = "oci_pull",
    ref = "alpine@sha256:9f2c4e1b7a0d38560c1a4c9b6e...",
    layout = True,
)
```

Leaving `ref` on a mutable tag logs a warning at parse time, on every run:

```text
WARN oci_pull: pulling a mutable tag "alpine:3.20" — heph caches on the ref
     string, so a moved tag serves the stale archive; pin the ref by
     @sha256:digest to make the pull reproducible
```

On an actual pull (never on a cache hit, since nothing is resolved then), a
second warning names the exact digest the tag currently resolves to — paste
it straight back into `ref`:

```text
WARN oci_pull: "alpine:3.20" currently resolves to
     "docker.io/library/alpine@sha256:9f2c4e1b7a0d38560c1a4c9b6e..." — pin
     `src` to that to make this pull reproducible
```

(The message refers to the field internally as `src` — this is the same
`ref` attribute set above.)

See [Reproducibility](/docs/concepts/reproducibility) for the same principle
applied elsewhere in heph.

### `oci_push`

Pushes an image archive to a registry. An **action**, not an artifact — it
has an external side effect (the upload) and is therefore never cached; it
runs every time it's requested.

```python title="BUILD"
target(
    name = "publish",
    driver = "oci_push",
    image = ":img",
    ref = "registry.io/me/app:1.2",
)
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `image` | `string` | **required** | Target address of the image to push — a `docker_build`, `oci_image`, or `oci_index` target. Only its archive output is consumed. |
| `ref` | `string` | **required** | Destination registry reference, e.g. `registry.io/me/app:1.2`. |
| `insecure` | `bool` | `false` | Push to an insecure (HTTP / self-signed) registry: plain HTTP, certificate validation off. |

A multi-platform archive pushes every instance plus the manifest list that
ties them together. Blobs the registry already has are skipped.

### `oci_load`

Loads an image archive into the local docker daemon. Also an action, not
cached — it mutates the daemon's image store and runs every time.

```python title="BUILD"
target(
    name = "load",
    driver = "oci_load",
    image = ":img",
)
```

```console title="terminal"
$ heph run //app:load
app_img:9f2c4e1b7a0d3856
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `image` | `string` | **required** | Target address of the image to load — a `docker_build`, `oci_image`, or `oci_index` target. Only its archive output is consumed. |
| `tag` | `string` | derived | Local tag to give the loaded image, e.g. `app:dev`. Left unset, the tag is derived from the image target's address and this load's input hash — the derived form changes if and only if the image changes, so two people building the same commit get the same tag, and it never points at whichever image happened to load last. Set `tag` only when a human needs to type something predictable. |
| `platform` | `string` | Linux on the host's architecture | Which instance to load out of a multi-platform archive, as `"os/arch"`. A daemon holds one image per tag, so a multi-arch archive must be narrowed to one instance on the way in. |

## Registry authentication

`oci_pull` and `oci_push` resolve credentials the same way the `docker` CLI
does — from `~/.docker/config.json` (or `$DOCKER_CONFIG`) and any
`docker-credential-*` helper it names — so a host already logged in with
`docker login` needs no extra configuration. There is no registry-auth option
on any `oci_*` rule; a pull or push against a public image needs no
credentials at all.

## Cache control

`docker_build`, `oci_image`, `oci_layer`, `oci_index`, and `oci_pull` all
accept `cache` as a bare bool or a dict with up to three keys:

| Key | Type | Default | Meaning |
|-----|------|---------|--------|
| `enabled` | bool | `true` | Enable local caching for this target. |
| `remote` | bool | `true` | Enable remote caching for this target. |
| `history` | int | `1` | Number of past revisions to retain in the local cache (minimum `1`). |

A bare `True` sets both `enabled` and `remote` to `true`. A bare `False`
disables both. `oci_push` and `oci_load` have no `cache` field — as actions
with an external side effect, they're never cached.
