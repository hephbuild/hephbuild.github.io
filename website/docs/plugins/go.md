---
title: "Go"
sidebar_position: 5
description: Go language support — analyze packages and generate library, binary, and test targets.
---

# Go

Provides Go language support for heph. The `go` provider analyzes Go packages
and generates targets for building libraries, binaries, and tests. It reads
package metadata, resolves source files and module dependencies, and wires up
the targets needed to compile and run Go code. Managed drivers do the
underlying work: toolchain provisioning (`go_toolchain`), package metadata
analysis (`go_golist`), Go package compilation (`go_compile`), test main
generation (`go_testmain`), and per-package lint/format analysis (`go_lint`,
`go_lint_gate`, `go_lint_fix`, `go_format`, `go_format_check`).

## Driver

A driver is the execution backend that knows how to run a particular kind of
target. This plugin registers nine drivers: `go_toolchain`, `go_golist`,
`go_compile`, `go_testmain`, `go_lint`, `go_lint_gate`, `go_lint_fix`,
`go_format`, and `go_format_check`. These are internal — you should not
interact with them directly.

## Enabling it

The Go plugin is an **external plugin** — it is not compiled into the heph
binary. It ships as a shared library (cdylib) with a manifest file
(`heph-go-plugin.json`). A single `plugins:` entry loads the provider and all
four drivers at once.

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
      gotool: "1.26.4"       # required — pinned version or "host"
      skip: []               # optional
      checksums:             # optional; recommended for supply-chain verification
        "1.26.4/linux/amd64": "<sha256hex>"
        "1.26.4/darwin/arm64": "<sha256hex>"
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gotool` | `string` | **required** | Go toolchain to use. Set to a pinned version like `"1.26.4"` to download the SDK hermetically from `go.dev/dl`, or `"host"` to use the `go` binary already on the host's `PATH`. |
| `govet` | `string` (target address) | the plugin's own published `heph-govet` build | The `heph-govet` binary that [lint and format targets](#linting-and-formatting) run. See [Pinning the analyzer binary](#pinning-the-analyzer-binary). |
| `checksums` | `map[string, string]` | `{}` | Expected SHA-256 digests for hermetic SDK tarballs, keyed `"<version>/<goos>/<goarch>"` (e.g. `"1.26.4/linux/amd64"`), and for `govet` release downloads, keyed `"govet/<tag>/<goos>/<goarch>"`. Look up SDK values at [go.dev/dl/?mode=json](https://go.dev/dl/?mode=json). When a key is missing the download is unverified (a warning is logged). SDK checksums have no effect when `gotool = "host"`. |
| `skip` | `string[]` | `[]` | Workspace-relative glob patterns for directories to exclude from Go package discovery. |
| `walk_db` | path | `<homeDir>/heph-plugin-go-fswalk.db` | Path to the filesystem walk cache database. |

### Toolchain modes

**Hermetic (recommended)** — set `gotool` to a Go version string:

```yaml title=".hephconfig"
options:
  gotool: "1.26.4"
  checksums:
    "1.26.4/linux/amd64": "<sha256>"
    "1.26.4/darwin/arm64": "<sha256>"
```

The plugin downloads the Go SDK tarball for the host platform from
`go.dev/dl`, verifies its SHA-256 (when a `checksums` entry is present), and
caches the extracted SDK. Every build, test, and analysis target depends on
that cached SDK and points `GOROOT` at it. No Go installation is required on
the host.

**Host** — set `gotool` to `"host"`:

```yaml title=".hephconfig"
options:
  gotool: "host"
```

The plugin uses the `go` binary found on the host's `PATH`. Builds are not
reproducible across machines with different Go versions.

### Skipping directories

Use `skip` to prevent the provider from scanning directories you don't want
included in Go package discovery — for example, directories containing
non-module code, generated stubs, or vendored packages managed outside of heph.
Each pattern is matched against the workspace-relative path of the directory.

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-go-plugin.json
    options:
      gotool: "1.26.4"
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
|-----------|--------|---------|
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

## Linting and formatting

A Go module gets four extra targets the moment it has a `.golangci.yml` (or
`.golangci.yaml`) at its module root — no `provider_state` toggle needed. Lint
analysis sees the module's whole first-party dependency graph, not just the
package being linted, so interprocedural checks (a `printf`-style wrapper, a
context that's never cancelled, …) stay accurate across package boundaries.

| Target | Does |
|--------|------|
| `lint-check` | Fails the build if the package has lint findings. Reports only, writes nothing. |
| `lint` | Applies the linter's suggested fixes back into the package's sources. |
| `format-check` | Fails the build if any file in the package isn't formatted. Reports only, writes nothing. |
| `format` | Reformats the package's sources in place. |

```bash title="terminal"
heph run //lib/auth:lint-check      # gate: fails on findings
heph run //lib/auth:lint            # fixer: applies suggested fixes
heph run //lib/auth:format-check    # gate: fails if unformatted
heph run //lib/auth:format          # fixer: reformats in place
```

`lint` and `format` rewrite files in the package directory — the same
in-place rewrite behavior as any [codegen](../concepts/codegen.md) fixer
target. A package whose module has no `.golangci.yml` gets none of these four
targets; `:build` and `:test` are unaffected either way.

### Selecting and configuring linters

`linters.default`/`enable`/`disable` in `.golangci.yml` select among four
available linters:

| Linter | Covers |
|--------|--------|
| `govet` | The standard `go vet` analyzers, plus opt-in ones (`shadow`, `fieldalignment`, `nilness`, `sortslice`, `unusedwrite`). |
| `staticcheck` | staticcheck (`SA*`) checks. |
| `gosimple` | gosimple (`S*`) checks. |
| `stylecheck` | stylecheck (`ST*`) checks. |

```yaml title=".golangci.yml"
linters:
  default: standard   # "standard" (govet only, the default), "all", or "none"
  enable:
    - staticcheck
  settings:
    govet:
      enable: [shadow]
      settings:
        printf:
          funcs: [Wrapf]
    staticcheck:
      checks: [all, -ST1000]
```

| Key | Effect |
|-----|--------|
| `linters.default` | `standard` (`govet` only — the default), `all` (all four linters), or `none`. |
| `linters.enable` / `linters.disable` | Add or remove linters from the default set, by name. |
| `linters.settings.govet.enable` / `.disable` / `.enable-all` / `.disable-all` | Turn individual vet analyzers on or off. |
| `linters.settings.govet.settings.<analyzer>.<flag>` | Per-analyzer flags, e.g. `printf.funcs`, `shadow.strict`. |
| `linters.settings.{staticcheck,gosimple,stylecheck}.checks` | Check patterns to include, e.g. `all`, `SA1000`, `-ST1003`, `SA1*`. |
| `linters.settings.stylecheck.initialisms` / `.dot-import-whitelist` / `.http-status-code-whitelist` | Config consumed by specific stylecheck checks. |

:::note
`unused` needs whole-program analysis and isn't available in this per-package
model.
:::

### Suppressing findings

```go title="handler.go"
func handle() { //nolint:staticcheck
	...
}
```

`//nolint[:linter1,linter2]` on its own line covers the next line of code;
trailing at the end of a line of code covers that line; bare `//nolint` (or
`//nolint:all`) covers every linter. Match against `staticcheck` for any
`staticcheck`/`gosimple`/`stylecheck` finding — golangci-lint folds those
three into one linter name.

`linters.exclusions` suppresses by rule instead of by comment:

```yaml title=".golangci.yml"
linters:
  exclusions:
    generated: lax        # lax (default) | strict | disable
    presets:
      - common-false-positives
    rules:
      - linters: [staticcheck]
        path: "_test\\.go$"
        text: "S1002"
    paths:
      - "third_party/.*"
```

| Key | Effect |
|-----|--------|
| `generated` | Whether findings in generated files are excluded: `lax` (default), `strict`, or `disable`. |
| `presets` | Built-in exclude patterns: `comments`, `common-false-positives`, `legacy`, `std-error-handling`. |
| `rules` | Per-rule `linters` / `path` / `path-except` / `text` filters — all present conditions on a rule must match. |
| `paths` / `paths-except` | Whole-file regexes to exclude (or to exclusively include). |

### Formatters

`format` and `format-check` default to `gofmt` when `.golangci.yml` sets no
`formatters`. Enable `gofumpt` and/or `goimports` (import sorting only — it
does not add missing imports) and tune their settings:

```yaml title=".golangci.yml"
formatters:
  enable:
    - gofumpt
    - goimports
  settings:
    gofmt:
      simplify: true
    gofumpt:
      extra-rules: true
    goimports:
      local-prefixes: [github.com/myorg/myrepo]
  exclusions:
    generated: lax
    paths:
      - "_gen\\.go$"
```

| Key | Effect |
|-----|--------|
| `formatters.enable` | `gofmt` (default), `gofumpt`, `goimports`. Applied imports → gofmt → gofumpt regardless of listing order. |
| `formatters.settings.gofmt.simplify` / `.rewrite-rules` | `gofmt -s` simplification and rewrite rules. |
| `formatters.settings.gofumpt.module-path` / `.extra-rules` | gofumpt options. |
| `formatters.settings.goimports.local-prefixes` | Import groups treated as "local" when sorting. |
| `formatters.exclusions.generated` / `.paths` | Same shape as the linter exclusions, applied to formatting instead. |

### Pinning the analyzer binary

Lint and format targets run through `heph-govet`, a binary the plugin
downloads and verifies automatically the first time it's needed — nothing to
configure by default. The default download is itself an [HTTP Fetch](./http-fetch.md)
target, checksum-verified against a digest baked into the plugin at release
time.

Point the `govet` option at a different target address to use another build
instead — for example one that compiles `heph-govet` from a local source
tree:

```yaml title=".hephconfig"
options:
  gotool: "1.26.4"
  govet: "//tools/heph-govet:build"
```

Add a `"govet/<tag>/<goos>/<goarch>"` entry to `checksums` to verify a pinned
`govet` release download other than the plugin's own build.

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

Three labels are recognized:

| Label           | Attach to a target that produces…                                          | Pulled into |
|-----------------|----------------------------------------------------------------------------|-------------|
| `go_src`        | Generated `.go` sources (and small embedded files cheap to produce).       | `:build`, `:build_test` |
| `go_embed_src`  | Embed-only assets for `//go:embed` that should not block `query`/`list`.   | `:build`, `:build_test` |
| `go_test_data`  | Files a test reads at runtime (fixtures, goldens).                         | `:test`, `:xtest`  |

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

### `go_embed_src` — embed assets excluded from package analysis

Label a target `go_embed_src` when it produces files referenced by `//go:embed`
that are expensive to build and should not run during `query`, `list`, or IDE
metadata operations.

Unlike `go_src`, outputs from `go_embed_src` targets are **not** staged during
package analysis. `heph query`, `heph list`, and editor integrations complete
without triggering the asset build. The files are staged only when the package
actually compiles.

```python title="web/BUILD"
target(
    name = "bundle",
    driver = "bash",
    labels = ["go_embed_src"],
    deps = {"src": glob("frontend/**")},
    out = "dist",
    run = "npm ci && npm run build -- --outdir=$OUT",
)
```

The package's `//go:embed dist/*` directive is satisfied at compile time, without
a frontend build running during `query` or metadata operations.

`go_embed_src` respects `go_codegen_root`: when an ancestor sets
`go_codegen_root = True`, embed-src targets are searched by package prefix across
the whole subtree, the same as `go_src`.

:::tip
If your embed asset is cheap to produce (a few static templates, a small binary),
`go_src` works fine — its output tree is staged before both analysis and compile.
Use `go_embed_src` specifically when the asset build is expensive enough that
blocking `query` or metadata on it is costly.
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

## provider_state — per-package configuration

`provider_state(provider="go", ...)` placed in a BUILD file configures the Go
provider for that package. `go_codegen_root` and `go_codegen_deps` always extend
to descendant packages. `test` and `link` apply to the exact declaring package by
default; add `recursive = True` to extend them to descendants. When the same key
applies at multiple depths, the deepest (closest) declaration wins.

### Recognized keys

| Key               | Type                  | Effect |
|-------------------|----------------------|----------|
| `go_codegen_root` | `bool`                | When `True` on an ancestor, `go_src` and `go_embed_src` targets are searched across the whole subtree rooted here instead of only the leaf package. Use when one generator feeds many descendant packages. Always applies to descendants, independent of `recursive`. |
| `go_codegen_deps` | `list[string]`        | Explicit codegen target addresses injected into every descendant package's sandbox. For generators not labelled `go_src`. The closest ancestor carrying it wins. Always applies to descendants, independent of `recursive`. |
| `go_embed_deps`   | `list[string]`        | Explicit embed-asset target addresses injected into every descendant package's compile step. The analog of `go_codegen_deps` for the `go_embed_src` lane — for targets that produce embed-only assets but aren't labelled `go_embed_src`. The closest ancestor carrying it wins. |
| `test`            | `bool \| struct(...)` | Controls test-target generation and configuration. Applies to the exact package by default; add `recursive = True` to extend to descendants. See below. |
| `link`            | `struct(...)`         | Link settings for a `main` package's `build` (binary) target. Applies to the exact package by default; add `recursive = True` to extend to descendants. See [Link configuration](#link-configuration). |
| `recursive`       | `bool`                | When `True`, extends this state's `test` and `link` config to all descendant packages. `go_codegen_root` and `go_codegen_deps` are unaffected — they always apply to descendants. |

### Skipping tests

`test = False` disables test-target generation for the exact declaring package.
Add `recursive = True` to disable across the whole subtree. A deeper `test = True`
(or the struct form) re-enables them — the closest applicable ancestor wins.

```python title="BUILD"
# Disable tests for this package only:
provider_state(provider = "go", test = False)

# Disable tests for this package and all descendants:
provider_state(provider = "go", recursive = True, test = False)

# Re-enable in a subdirectory:
provider_state(provider = "go", test = True)
```

### Test environment

The struct form configures the generated `test`/`xtest` run targets. Like the
boolean form, it applies to the exact declaring package by default. Add
`recursive = True` to extend it to descendants. A struct-form state also
re-enables tests even when an ancestor set `test = False`.

```python title="BUILD"
provider_state(
    provider = "go",
    test = {
        "env":              {"FOO": "1"},   # hashed; affects the cache key
        "pass_env":         ["HOME"],       # hashed; affects the cache key
        "runtime_env":      {"BAR": "2"},   # not hashed; runtime-only
        "runtime_pass_env": ["PATH"],       # not hashed; runtime-only
        "pre_run":          ["export FOO=bar", "mkdir -p ./scratch"],
    },
)
```

| Field              | Type           | Hashed | Description |
|--------------------|----------------|--------|-------------|
| `env`              | `map[string]`  | yes    | Env vars set on the test run. |
| `pass_env`         | `list[string]` | yes    | Names of host env vars forwarded to the test run. |
| `runtime_env`      | `map[string]`  | no     | Like `env` but excluded from the cache key. |
| `runtime_pass_env` | `list[string]` | no     | Like `pass_env` but excluded from the cache key. |
| `pre_run`          | `list[string]` | yes    | Shell lines run before the test binary. When non-empty, the target switches from the `exec` driver to the `bash` driver so the lines execute as shell. |

### Link configuration

The `link` struct configures the `build` (binary) target generated for a
`package main`. It applies to the exact declaring package by default; add
`recursive = True` to extend it to descendant packages.

When multiple applicable states carry `link`, their values accumulate
shallow-to-deep: a recursive ancestor's flags, deps, and runtime deps are
collected first, then the package's own. For `deps` and `runtime_deps`,
accumulation happens per dep group — see [Naming dep groups](#naming-dep-groups).

```python title="BUILD"
provider_state(
    provider = "go",
    link = {
        "flags":        ["-X main.version=1.2.3", "-s"],
        "deps":         ["//embed:assets"],
        "runtime_deps": ["//data:config"],
    },
)
```

| Field          | Type                                                            | Hashed | Description |
|----------------|------------------------------------------------------------------|--------|-------------|
| `flags`        | `list[string]`                                                    | yes    | Extra flags passed verbatim to `go tool link`, inserted before `-o`. Use for `-X` linker vars, stripping flags (`-s`, `-w`), etc. |
| `deps`         | `string \| list[string] \| map[string, string \| list[string]]`   | yes    | Target addresses staged into the link sandbox as hashed inputs. `flags` can reference their outputs. |
| `runtime_deps` | `string \| list[string] \| map[string, string \| list[string]]`   | no     | Target addresses staged with the binary at run time only. Not hashed — they do not affect the cache key. |

Unknown keys in the `link` map are rejected with a clear error naming the unrecognized field.

#### Naming dep groups

A single address, or a list of addresses, lands in the default group and is
staged in the sandbox under the `link_deps` / `link_runtime_deps` key:

```python title="BUILD"
provider_state(
    provider = "go",
    link = {"deps": ["//embed:assets", "//embed:more"]},
)
```

Pass a map instead to split `deps` or `runtime_deps` into named groups. Each
key is used verbatim as the sandbox key its addresses are staged under, and a
map value can be a single address string or a list:

```python title="BUILD"
provider_state(
    provider = "go",
    link = {
        "deps": {
            "assets": ["//embed:assets"],
            "icons":  "//embed:icons",   # a bare string is a single-address group
        },
    },
)
```

The same group name declared on a recursive ancestor and on the package itself
merges shallow-to-deep; different group names stay separate.

:::note
Named groups are staged verbatim, so avoid reusing the plugin's own internal
group names (`link_deps`, `link_runtime_deps`, `lib_*`, `gosdk`) — a collision
merges your addresses into that internal group instead of a distinct one.
:::

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
| **Skill `heph-go`** | Auto-activates whenever Claude works on Go under heph — enabling the provider and the `go_golist` / `go_compile` / `go_testmain` drivers, building and testing packages, wiring `go_src` / `go_embed_src` / `go_codegen_root` / `go_codegen_deps` / `go_embed_deps` and `go_test_data`, pinning `gotool`, or debugging missing generated code, embeds, modules, or testdata. Carries this page's reference bundled. |
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
