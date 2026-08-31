---
title: "Devenv"
sidebar_position: 14
description: Describes a devenv shell environment other targets can run inside.
---

# Devenv

The Devenv plugin registers one driver, `devenv_runner`, that captures a
[devenv](https://devenv.sh) shell environment into a **runner** — a target
other targets point at with `runner = "//pkg:name"` to run inside that
environment instead of on the bare host. See [Runners](/docs/concepts/runners)
for what a runner is and how a target uses one.

## Driver

A **driver** is the component that knows how to execute a target's action.
This plugin registers a single driver, `devenv_runner`.

## Enabling it

The Devenv plugin is an **external plugin** — it is not compiled into the heph
binary. It ships as a shared library (cdylib) with a manifest file
(`heph-devenv-plugin.json`). Requires `devenv` on the host `PATH` (or pinned
via the `bin` option below).

```yaml title=".hephconfig"
plugins:
  - url: <HEPH_ARTIFACTS_URL>/heph-devenv-plugin.json
    checksum: sha256:<hex>   # optional; pin from heph-devenv-plugin.json.sha256
```

The `checksum` field is optional but recommended — it pins the manifest to a
known digest so a tampered or misdelivered manifest is rejected before
loading. See [Pinning manifests with checksums](/docs/reference/configuration#pinning-manifests-with-checksums)
for details.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bin` | `string` | `devenv` | Path (or name on `PATH`) of the `devenv` binary to resolve the environment with. |

## Usage

```python title="BUILD"
target(
    name = "runner",
    driver = "devenv_runner",
    deps = glob("devenv.*"),
)

target(
    name = "build",
    driver = "bash",
    run = "make",
    out = "out/",
    runner = ":runner",
)
```

`//pkg:build` now runs `make` inside the environment this package's
`devenv.nix` describes, instead of on the host.

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `string` | `"wrap"` | `"wrap"` captures the environment once, at build time, and runs targets locally with it. `"session"` holds one `devenv shell` open for the whole build and runs targets inside it. See [Choosing a mode](#choosing-a-mode). |
| `root` | `string` | the target's own package | Directory containing `devenv.nix`, relative to the target's package. Must stay inside the package — an absolute path or a `..` component is rejected. |
| `profile` | `string` | unset | devenv profile to enter (`devenv --profile <profile> shell`), if the environment declares one. |
| `deps` | `string[]` | `[]` | The environment's own files (`devenv.nix`, `devenv.lock`, `devenv.yaml`, anything they import) as target addresses — typically a `glob`. Rebuilds the runner when the environment's definition changes; **not** what the fingerprint is derived from — see [Fingerprint](#fingerprint). |
| `pass_env` | `string[]` | a fixed set `devenv` needs to reach the nix store and the network (`HOME`, `PATH`, `NIX_PATH`, TLS/proxy variables, …) | Host environment variables `devenv` may see while resolving the environment. Hashed at parse. |

## Choosing a mode

`wrap` is what most workspaces want: it is faster (no `devenv` process per
target, no shell evaluation on the build's hot path) and its fingerprint is
the strongest available, because it *is* the resolved environment.

`session` costs more — one held `devenv shell` for the whole build — and
earns that cost only when the environment is not just a set of variables:
shell activation with side effects, services devenv starts, state under
`.devenv/`. Reach for it when what matters is process ancestry, not just the
environment's variables.

## Fingerprint

Every runner's cache key rests on the bytes it writes, so this plugin
resolves the environment (`devenv shell -- env`) and folds a digest of the
result into the runner, rather than hashing `devenv.nix` — a `devenv.nix` can
`import` files nobody declared in `deps`, which a source-file hash would
miss. It prefers `DEVENV_PROFILE`, the nix store path devenv resolves the
environment to: identical across machines and directories for the same
environment, and the strongest signal available. See
[Runners → The fingerprint](/docs/concepts/runners#the-fingerprint) for why
this matters.

Cached locally, never remotely — the captured environment names this
machine's own nix store paths, and publishing it would let one host's
resolution key another's builds.

## Guarding against a self-referential default

A runner target must not run under the workspace-wide default it configures.
The natural way to write one is a `bash` target, which would otherwise become
its own runner and cycle on the first build — the `exec`/`bash` driver
excludes a target from a default it is itself. If the runner's own `deps` are
themselves `exec`/`bash` targets, give them `runner = "local"` explicitly, or
a workspace-wide default turns them into a cycle too.
