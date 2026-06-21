# heph go provider — full reference

Distilled from <https://hephbuild.github.io/docs/plugins/go>. When exact current
behavior matters, fetch that page (its `.md` twin is indexed at
<https://hephbuild.github.io/llms.txt>).

## What it is

`go` is a **provider**: it discovers Go packages (by `go.mod` + sources) and
generates the targets to build and test them. It registers no driver you call by
hand. Four **managed drivers** do the underlying work:

| Driver          | Does                                                        |
|-----------------|-------------------------------------------------------------|
| `go_toolchain`  | Downloads and provisions the hermetic Go SDK.              |
| `go_golist`     | Package metadata analysis — the equivalent of `go list`.   |
| `go_embed`      | `//go:embed` pattern processing.                            |
| `go_testmain`   | Generates the test `main` for `go test`.                   |

You should not interact with these drivers directly; they are internal plumbing.

## Registration

The Go plugin is an **external plugin** (not compiled into the heph binary). A
single `plugins:` entry loads the provider and all four drivers:

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/<HEPH_VERSION_URL>/heph-go-plugin.json
    options:
      gotool: "1.26.4"       # required — pinned version or "host"
      skip: []               # optional
      checksums:             # optional; recommended for supply-chain verification
        "1.26.4/linux/amd64": "<sha256hex>"
        "1.26.4/darwin/arm64": "<sha256hex>"
```

### Plugin options

| Option     | Type                 | Default      | Description |
|------------|----------------------|--------------|-------------|
| `gotool`   | `string`             | **required** | Go toolchain to use. Set to a pinned version like `"1.26.4"` (hermetic SDK downloaded from `go.dev/dl`) or `"host"` (use the `go` binary already on the host's `PATH`). |
| `checksums` | `map[string, string]` | `{}`        | Expected SHA-256 digests for hermetic SDK tarballs, keyed `"<version>/<goos>/<goarch>"` (e.g. `"1.26.4/linux/amd64"`). Look up values at https://go.dev/dl/?mode=json. Without an entry the SDK downloads unverified (warning logged). No effect when `gotool = "host"`. |
| `skip`     | `string[]`           | `[]`         | Workspace-relative glob patterns for directories to exclude from Go package discovery. Each pattern is matched against the directory's workspace-relative path. |
| `walk_db`  | path                 | `<homeDir>/heph-plugin-go-fswalk.db` | Path to the filesystem walk cache database. |

`skip` is for non-module code, generated stub trees you manage outside heph, or
vendored packages. Example: `["vendor", "internal/generated/**"]`.

### Toolchain modes

**Hermetic (recommended)** — `gotool` is a Go version string:

- The plugin downloads `go<version>.<goos>-<goarch>.tar.gz` from `go.dev/dl`,
  verifies its SHA-256 (if a `checksums` entry is present), and caches the
  extracted SDK.
- Every build, test, and analysis target deps the cached SDK and points `GOROOT`
  at it — no Go installation required on the host.
- `CGO_ENABLED=0`, `GOTOOLCHAIN=local`, and `GOWORK=off` are pinned automatically.
- Third-party module *metadata* still consults the host module cache / `GOPROXY`
  (content-addressed and `go.sum`-verified, same as always).

**Host** — `gotool = "host"`:

- Uses the `go` binary found on `PATH` inside the sandbox. Non-hermetic:
  different Go versions across machines produce different builds.

## Generated targets

For a normal package the provider produces (the two you reference directly):

| Target   | Builds                                          | Labels            |
|----------|-------------------------------------------------|-------------------|
| `:build` | The library, or binary for `package main`.      | —                 |
| `:test`  | The package's in-package tests.                 | `test`, `go-test` |

There is also `:xtest` for external (`package foo_test`) tests. A number of
internal variants exist to make compilation and linking agree
(`build_test_lib`, `build_xtest_lib`, `build_testmain_lib`, `testmain`,
`embed_test`, etc., plus a per-package `_golist`). These are implementation
detail — don't depend on them by hand; depend on `:build`, `:test`, `:xtest`.

Inspect what exists:

```bash
heph query all //cmd/server          # all generated targets for the package
heph inspect deps //cmd/server:build # resolved dependency edges
```

## Generated dependency address families

The provider wires every import automatically through two address families. You
only read these (e.g. in a dep graph); never write them by hand.

| Address                                       | Resolves to |
|-----------------------------------------------|-------------|
| `//@heph/go/std/<pkg>`                         | A Go standard-library package. |
| `//@heph/go/thirdparty/<module>@<version>`     | A pinned third-party module (version from `go.mod`). |

Because module + version are part of the address, a dependency bump changes the
address and invalidates only the targets importing it.

## Provider functions & `heph.go.build_addr`

| Function | Signature | Returns |
|---|---|---|
| `heph.go.build_addr` | `build_addr(pkg: string, goos: string, goarch: string, tags: list[string]) -> string` | Canonical target address for building `pkg` on the given platform. |

All arguments are type-enforced: wrong type, missing required arg, or unknown
keyword → hard error naming the function and the offending argument.

Go targets are parameterized by platform via address arguments: `:build` with no
args builds for the host; `//cmd/server:build@goarch=amd64,goos=linux` (plus
optional `tags="a,b"`) cross-compiles. In BUILD files, format these addresses
with `heph.go.build_addr` instead of assembling strings:

```python
heph.go.build_addr(pkg, goos, goarch, tags = [])
# heph.go.build_addr("cmd/server", "linux", "amd64")
#   -> "//cmd/server:build@goarch=amd64,goos=linux"
```

- `pkg` — the addr's package: `"cmd/server"`, `"@heph/go/std/fmt"`, or a
  thirdparty `@heph/go/thirdparty/<module>@<version>` path.
- `tags` are sorted into the address.
- Pure string formatting — resolves and builds nothing. The result is the
  canonical address the provider serves, ready for a `deps` field (e.g. embed a
  linux/amd64 binary in a container image built on a darwin host).
- `heph inspect functions` lists every provider-exposed BUILD function.

## Wiring inputs the provider can't infer

The provider reads hand-written `.go` and resolves imports. Two things it cannot
infer — generated code and runtime test files — are wired by **labelling** the
target that produces them.

| Label          | Attach to a target producing…                 | Pulled into          |
|----------------|-----------------------------------------------|----------------------|
| `go_src`       | Generated `.go` or embedded files.            | `:build`, `:build_test` |
| `go_test_data` | Files a test reads at runtime (fixtures, goldens). | `:test`, `:xtest`   |

### `go_src` — generated source compiled into the package

Labelling a codegen target `go_src` causes its **entire output tree** to be
unpacked into the package directory before analysis. So `go list` resolves
`//go:embed` patterns against the generated files, and the build/tests compile
them as if committed. The unpacked tree includes sibling non-`.go` outputs (e.g.
`.wasm.br`) so embeds work.

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

`//api:build` and `//api:test` now include `api.pb.go` with no `deps` entry. Pair
with `codegen = "copy"` so files also land in the tree for editors/`gofmt`;
`heph tool gen-gitignore` keeps them untracked.

### `go_test_data` — fixtures staged for tests

Labelling a target `go_test_data` stages its outputs into the sandbox next to the
test binary when `:test`/`:xtest` runs — the test finds them at the expected
path without widening isolation, so it stays reproducible and cacheable.

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

**Rule of thumb:** code the package *imports* → `go_src`; files a test *reads* →
`go_test_data`.

## `provider_state` — per-subtree configuration

`provider_state(provider="go", ...)` placed in a BUILD file configures the go
provider for that package **and every descendant package**. When the same key is
set at multiple depths, the **deepest (closest) ancestor wins** — set a default
high and override it in a leaf.

```python title="BUILD"
provider_state(
    provider = "go",
    go_codegen_root = True,
    go_codegen_deps = ["//tools/mockgen:mocks"],
    test = False,  # disable tests; or True / struct form — see below
)
```

### Recognized keys

| Key               | Type                   | Effect |
|-------------------|------------------------|--------|
| `go_codegen_root` | `bool`                 | When `True` on an ancestor, `go_src` targets are searched across the whole subtree rooted here (matched by package prefix) instead of only the leaf package. Use when one generator feeds many descendant packages. The deepest ancestor with this flag whose package is a prefix of the target's package is chosen. |
| `go_codegen_deps` | `list[string]`         | Explicit codegen target addresses injected into every descendant package's analysis/build sandbox. For generators that aren't labelled `go_src`. Honored independently of `go_codegen_root` (a BUILD setting only this still injects them). The closest ancestor carrying it wins. |
| `test`            | `bool \| struct(...)` | `False` stops test-target generation for this subtree; `True` / unset runs them. The struct form configures `test`/`xtest` run targets — env vars and pre-run shell lines — package-scoped only. See below. |

### `test` — skipping and environment

**Bool form** (inherited down the package tree — the deepest ancestor wins):

- `test = False` — disables test-target generation for this package and all descendants.
- `test = True` — (default) enables them. Overrides an ancestor's `test = False`.

**Struct form** (package-scoped only — does **not** affect descendants):

Configures the generated `test`/`xtest` run targets. A struct-form
state also re-enables tests even when an ancestor set `test = False`.

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

### How `go_src`/codegen resolution actually composes

For each package, the package sandbox source set is:

1. A filesystem glob of all non-`.go` files in the package (checked-in embed
   assets, etc.).
2. A `q@label=go_src` query — scoped to the leaf **package**, or to the
   **package prefix** of the chosen `go_codegen_root` when one is set — whose full
   output tree is unpacked into the package dir.
3. The `go_codegen_deps` from the closest ancestor BUILD state.

This is shared between `_golist` (so `go list` resolves embeds) and the embed
driver (so its runtime re-glob matches Go's resolution).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `heph query all <pkg>` shows no `:build`/`:test` | go plugin not registered, or pkg under a `skip` glob | Add the plugin entry; check `options.skip`. |
| Provider errors: `` `gotool` is required `` | `gotool` option missing | Add `gotool: "<version>"` or `gotool: "host"` to `options`. |
| Build fails: undefined symbol from generated code | generator not labelled `go_src`, or it's in another package without `go_codegen_root` | Label it `go_src`; if cross-package, add `go_codegen_root=True` at the covering root. |
| `//go:embed` finds nothing | embedded asset not produced/labelled so it isn't unpacked into the pkg | Produce it under a `go_src` target (its full output tree is unpacked). |
| Test panics: open testdata/...: no such file | fixture not staged into the sandbox | Label the producing target `go_test_data`. |
| Wrong/old third-party version compiled | `go.mod` version drift vs the generated `@version` address | Reconcile `go.mod`; the address (and thus cache key) follows the pinned version. |
| Non-reproducible builds across machines | using `gotool = "host"` | Switch to a pinned version: `gotool: "1.26.4"` and add `checksums`. |
| SDK checksum mismatch | `checksums` entry doesn't match the tarball | Look up the correct SHA-256 at https://go.dev/dl/?mode=json. |

## Verification commands

```bash
heph query all //pkg                 # what the provider generated
heph inspect deps //pkg:build        # are go_src / std / thirdparty edges present?
heph inspect hashin //pkg:build      # what makes up the cache key
heph run //pkg:build                 # compile
heph run //pkg:test                  # in-package tests
heph run //pkg:xtest                 # external tests
heph run //gen:target --shell        # (bash/sh codegen) inspect the sandbox
```
