---
title: "Go"
sidebar_position: 5
description: Go language support — analyze packages and generate library, binary, and test targets.
---

# Go

Provides Go language support for heph. The `go` provider analyzes Go packages
and generates targets for building libraries, binaries, and tests. It reads
package metadata, resolves source files and module dependencies, and wires up
the targets needed to compile and run Go code. Three managed drivers do the
underlying work: package metadata analysis (`go_golist`), Go embed processing
(`go_embed`), and test main generation (`go_testmain`).

## Driver

A driver is the execution backend that knows how to run a particular kind of
target. This plugin registers three drivers: `go_golist`, `go_embed`, and
`go_testmain`. These are mostly internal, you should not be interracting with
them directly.

## Enabling it

The Go plugin is an **external plugin** — it is not compiled into the heph
binary. It ships as a shared library (cdylib) with a manifest file
(`heph-go-plugin.json`). A single `plugins:` entry loads the provider and all
three drivers at once.

Use `url:` to have heph fetch and cache the plugin automatically:

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-go-plugin.json
    checksum: sha256:<hex>   # optional; pin from heph-go-plugin.json.sha256
```

The `checksum` field is optional but recommended — it pins the manifest to a
known digest so a tampered or misdelivered manifest is rejected before loading.
See [Pinning manifests with checksums](/docs/reference/configuration#pinning-manifests-with-checksums)
for details.

## Configuration

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-go-plugin.json
    checksum: sha256:<hex>   # optional
    options:
      gotool: "//@heph/bin:go"  # optional
      skip: []                  # optional
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gotool` | `string` | `"//@heph/bin:go"` | Address of the Go binary target used by the provider and the `go_golist` driver. |
| `skip` | `string[]` | `[]` | Workspace-relative glob patterns for directories to exclude from Go package discovery. |
| `walk_db` | path | `<homeDir>/heph-plugin-go-fswalk.db` | Path to the filesystem walk cache database. |

### Skipping directories

Use `skip` to prevent the provider from scanning directories you don't want
included in Go package discovery — for example, directories containing
non-module code, generated stubs, or vendored packages managed outside of heph.
Each pattern is matched against the workspace-relative path of the directory.

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-go-plugin.json
    options:
      skip:
        - vendor
        - "internal/generated/**"
```

`skip` is a hard boundary for first-party packages: it applies to both
discovery and direct target resolution. Addressing a first-party package inside
a skipped subtree — for example `heph run //vendor/pkg:build` — returns not
found. Standard library (`@heph/go/std/…`) and third-party module
(`@heph/go/thirdparty/…`) packages live outside the workspace tree and are
never affected by `skip`.

## Usage

The provider analyzes each Go package from its `go.mod` and source files and
generates targets for it — you don't write `target()` calls for Go code. For a
package it produces:

| Target    | Builds | Labels |
|-----------|--------|--------|
| `:build`  | The library or, for `package main`, the binary. | |
| `:test`   | The package's tests. | `test`, `go-test` |

Explore what was generated for the package in the current directory:

```bash title="terminal"
heph query all .
```

Then build or test by address:

```bash title="terminal"
heph run //cmd/server:build     # compile the binary
heph run //lib/auth:test        # run the package's tests
```

## Provider functions

The go plugin exposes one helper function in every BUILD file under the `heph.go`
namespace.

| Function | Signature | Returns |
|----------|-----------|-------|
| `heph.go.build_addr` | `build_addr(pkg: string, goos: string, goarch: string, tags: list[string]) -> string` | The canonical target address for building `pkg` on the given platform. |

The function enforces its argument types: wrong type, missing required argument,
or unknown keyword produces a clear error.

See [Targeting another platform](#targeting-another-platform) for usage details.

## Targeting another platform

Go targets are parameterized by platform through address arguments. An address
without arguments builds for the host; add `goos` and `goarch` (and optionally
`tags`) to cross-compile:

```bash title="terminal"
heph run //cmd/server:build                            # host platform
heph run //cmd/server:build@goarch=amd64,goos=linux    # cross-compile
```

In a BUILD file, don't assemble these address strings by hand — the provider
exposes `heph.go.build_addr()` to format them:

```python title="BUILD"
heph.go.build_addr(pkg, goos, goarch, tags = [])
```

| Argument | Default   | Meaning |
|----------|-----------|-------|
| `pkg`    | required  | The target's package, e.g. `"cmd/server"`. |
| `goos`   | required  | Target operating system, e.g. `"linux"`. |
| `goarch` | required  | Target architecture, e.g. `"amd64"`. |
| `tags`   | `[]`      | Build tags to compile with. |

It returns the canonical address string — exactly the address the provider
generates for that package — ready to drop into a dependency field:

```python title="cmd/server/BUILD"
target(
    name = "image",
    driver = "bash",
    deps = {"bin": heph.go.build_addr("cmd/server", "linux", "amd64")},
    run = "./package-image.sh $SRC_BIN $OUT",
    out = "image.tar",
)
```

The image target now embeds the linux/amd64 binary regardless of the machine
running the build. Calling `build_addr` only formats the address — it does not
resolve or build anything.

:::note
List every provider-exposed BUILD function with `heph inspect functions`.
:::

## Generated code and test data

The provider analyzes Go packages, but a package often needs files that aren't
hand-written `.go` sources — generated code (protobuf stubs, mocks, enums) or
fixtures a test reads at runtime. You don't wire these into the `:build` and
`:test` targets by hand. Instead you **label** the target that produces them and
the provider picks it up automatically.

Two labels are recognized:

| Label           | Attach to a target that produces…                  | Pulled into |
|-----------------|----------------------------------------------------|-------------|
| `go_src`        | Generated `.go` or embedded files.                 | `:build`, `:build_test` |
| `go_test_data`  | Files a test reads at runtime (fixtures, goldens). | `:test`, `:xtest`  |

### `go_src` — generated source

Label a codegen target `go_src` and its output tree is unpacked into the
package before analysis, so the generated `.go` (and embedded) files are
compiled as part of the package — exactly as if you'd committed them. This is
how `go list`, the build, and the tests all see code produced by `protoc`,
`mockgen`, `stringer`, and friends.

```python title="api/BUILD"
target(
    name = "proto",
    driver = "bash",
    codegen = "copy",
    labels = ["go_src"],
    deps = {"src": glob("*.proto")},
    out = glob("*.pb.go"),
    run = "protoc --go_out=. $SRC_SRC",
)
```

The `api` package now builds and tests with `api.pb.go` included — no `deps`
entry, no reference to `:proto` anywhere. Add the generator, label it, done:

```bash title="terminal"
heph run //api:build     # compiles your sources + the generated .pb.go
heph run //api:test      # tests see the generated code too
```

:::tip
Pair `go_src` with `codegen = "copy"` (see [Codegen](../concepts/codegen.md))
so the generated files also land in the tree for your editor and `gofmt`, and
`heph tool gen-gitignore` keeps them out of git.
:::

### `go_test_data` — test fixtures

Tests frequently read files from disk — golden files, sample inputs, a fixture
database. Label the target that produces them `go_test_data` and its outputs are
staged into the sandbox next to the test binary when `:test` (or `:xtest`) runs,
so the test finds them at the path it expects.

```python title="parser/BUILD"
target(
    name = "fixtures",
    driver = "bash",
    labels = ["go_test_data"],
    deps = {"src": glob("schema/*.json")},
    out = glob("testdata/*.golden"),
    run = "./gen-goldens.sh",
)
```

```bash title="terminal"
heph run //parser:test     # the .golden files are present in the sandbox
```

Because the sandbox is isolated, a test only sees the files its package
declares. Labeling a fixture target `go_test_data` is what makes those files
visible to the test without loosening isolation — the test stays reproducible
and cacheable.

### Generated dependency addresses

The provider wires each package's imports automatically through two address
families it generates — you reference these only when reading a dependency
graph, never by hand:

| Address | Resolves to |
|---------|-------------|
| `@heph/go/std/<pkg>` | A package from the Go standard library. |
| `@heph/go/thirdparty/<module>@<version>` | A pinned third-party module. |

Because the module and version are part of the address, a dependency bump
changes the address and invalidates only the targets that import it.

## provider_state — per-subtree configuration

`provider_state(provider="go", ...)` placed in a BUILD file configures the Go
provider for that package and every descendant package. When the same key is set
at multiple depths, the deepest (closest) ancestor wins.

### Recognized keys

| Key               | Type                  | Effect |
|-------------------|----------------------|---------|
| `go_codegen_root` | `bool`                | When `True` on an ancestor, `go_src` targets are searched across the whole subtree rooted here instead of only the leaf package. Use when one generator feeds many descendant packages. |
| `go_codegen_deps` | `list[string]`        | Explicit codegen target addresses injected into every descendant package's sandbox. For generators not labelled `go_src`. The closest ancestor carrying it wins. |
| `test`            | `bool \| struct(...)` | Controls test-target generation and environment for this package and descendants. See below. |

### Skipping tests

`test = False` disables test-target generation for this package and all
descendants. A deeper `test = True` (or the struct form) re-enables them — the
closest ancestor wins.

```python title="BUILD"
# Disable tests for this subtree:
provider_state(provider = "go", test = False)

# Re-enable in a subdirectory:
provider_state(provider = "go", test = True)
```

### Test environment

The struct form sets environment variables on the generated `test`/`xtest` run
targets. Unlike the boolean form, it is **package-scoped**: it applies only to
the exact package where the `provider_state` lives — descendants are not
affected. A struct-form state also re-enables tests even when an ancestor set
`test = False`.

```python title="BUILD"
provider_state(
    provider = "go",
    test = {
        "env":              {"FOO": "1"},   # hashed; affects the cache key
        "pass_env":         ["HOME"],       # hashed; affects the cache key
        "runtime_env":      {"BAR": "2"},   # not hashed; runtime-only
        "runtime_pass_env": ["PATH"],       # not hashed; runtime-only
    },
)
```

| Field              | Type           | Hashed | Description |
|--------------------|----------------|--------|-------------|
| `env`              | `map[string]`  | yes    | Env vars set on the test run. |
| `pass_env`         | `list[string]` | yes    | Names of host env vars forwarded to the test run. |
| `runtime_env`      | `map[string]`  | no     | Like `env` but excluded from the cache key. |
| `runtime_pass_env` | `list[string]` | no     | Like `pass_env` but excluded from the cache key. |

## Claude Code plugin

`heph-go` is a [Claude Code](https://claude.com/claude-code) plugin focused on Go
under heph: it teaches Claude to enable the provider and drivers, wire generated
code (`go_src` / `go_codegen_root` / `go_codegen_deps`) and test fixtures
(`go_test_data`), and keep `:build` / `:test` green.

It ships from this docs site, which doubles as a plugin **marketplace**.

### Install

Run both commands inside Claude Code:

```text title="Claude Code"
/plugin marketplace add hephbuild/hephbuild.github.io
/plugin install heph-go@heph-marketplace
```

The first command registers the marketplace from this repository; the second
installs the plugin. Restart Claude Code if prompted.

### What you get

| Piece | What it does |
|---|---|
| **Skill `heph-go`** | Auto-activates whenever Claude works on Go under heph — enabling the provider and the `go_golist` / `go_embed` / `go_testmain` drivers, building and testing packages, wiring `go_src` / `go_codegen_root` / `go_codegen_deps` and `go_test_data`, pinning `gotool`, or debugging missing generated code, embeds, modules, or testdata. Carries this page's reference bundled. |
| **Agent `heph-go-expert`** | A specialist subagent for non-trivial Go-in-heph jobs: standing up the provider, wiring cross-package codegen, staging fixtures, or diagnosing why a `:build` / `:test` fails to see what it needs. |
| **`/heph-go-setup`** | Turn on and configure Go support — provider, the three drivers, `gotool`, and `skip`. |
| **`/heph-go-codegen`** | Wire generated code and test fixtures into a package via `go_src`, `go_codegen_root`, `go_codegen_deps`, and `go_test_data`. |
| **`/heph-go-check`** | Audit a workspace's Go setup — drivers enabled, `gotool` / `skip` sane, generated code and fixtures wired, `:build` / `:test` green — and fix what isn't. |

The skill activates on its own — you don't invoke it. Type a command with its
leading slash; address the agent by name ("ask the heph-go-expert to…").

:::tip
The plugin's bundled knowledge mirrors this page. When an exact option or label
matters, the skill fetches the matching `.md` doc live (indexed at
[llms.txt](https://hephbuild.github.io/llms.txt)), so it stays current even
between plugin updates.
:::

For general heph support beyond Go, install `heph-expert` the same way — see the
[Claude Code plugin guide](../guides/claude-code-plugin.md).

### Update

Pull the latest marketplace catalog, then upgrade:

```text title="Claude Code"
/plugin marketplace update heph-marketplace
/plugin install heph-go@heph-marketplace
```

### Uninstall

```text title="Claude Code"
/plugin uninstall heph-go@heph-marketplace
```
