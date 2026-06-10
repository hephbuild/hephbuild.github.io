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

Registered as an opt-in provider factory named `go` in `.hephconfig`. The three
drivers (`go_golist`, `go_embed`, `go_testmain`) are registered as managed
driver factories and must be enabled in the `drivers` section of
`.hephconfig`.

## Configuration

```yaml title=".hephconfig"
providers:
  - name: go
    options:
      gotool: "//@heph/bin:go"  # Path to Go binary (optional, defaults to //@heph/bin:go)

drivers:
  - name: go_golist
  - name: go_embed
  - name: go_testmain
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gotool` | `string` | `"//@heph/bin:go"` | Address of the Go binary target to use. |
| `skip` | `string[]` | `[]` | Workspace-relative glob patterns for directories to exclude from Go package discovery. |

### Skipping directories

Use `skip` to prevent the provider from scanning directories you don't want
included in Go package discovery — for example, directories containing
non-module code, generated stubs, or vendored packages managed outside of heph.
Each pattern is matched against the workspace-relative path of the directory.

```yaml title=".hephconfig"
providers:
  - name: go
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
heph.go.build_addr(pkg, goos, goarch, tags = [], name = "build")
```

| Argument | Default   | Meaning |
|----------|-----------|---------|
| `pkg`    | required  | The target's package, e.g. `"cmd/server"`. |
| `goos`   | required  | Target operating system, e.g. `"linux"`. |
| `goarch` | required  | Target architecture, e.g. `"amd64"`. |
| `tags`   | `[]`      | Build tags to compile with. |
| `name`   | `"build"` | Target name — pass `"build_lib"` for the library. |

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
