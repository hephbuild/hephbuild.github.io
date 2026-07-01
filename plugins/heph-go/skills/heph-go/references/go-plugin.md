# heph go provider — full reference

Distilled from <https://hephbuild.github.io/docs/plugins/go>. When exact current
behavior matters, fetch that page (its `.md` twin is indexed at
<https://hephbuild.github.io/llms.txt>).

## What it is

`go` is a **provider**: it discovers Go packages (by `go.mod` + sources) and
generates the targets to build and test them. It registers no driver you call by
hand. Four **managed drivers** do the underlying work:

| Driver          | Does                                                                            |
|-----------------|---------------------------------------------------------------------------------|
| `go_toolchain`  | Downloads and provisions the hermetic Go SDK.                                   |
| `go_golist`     | Package metadata analysis — the equivalent of `go list`.                        |
| `go_compile`    | Compiles a Go package archive (importcfg, `//go:embed` resolution, asm, pack).  |
| `go_testmain`   | Generates the test `main` for `go test`.                                        |

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
|----------|---------------------------------------------------|-------------------|
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

The provider reads hand-written `.go` and resolves imports. Three things it cannot
infer — generated code, embed-only assets, and runtime test files — are wired by
**labelling** the target that produces them.

| Label          | Attach to a target producing…                                           | Pulled into          |
|----------------|-------------------------------------------------------------------------|-----------------------|
| `go_src`       | Generated `.go` sources (and small embedded files cheap to produce).    | `:build`, `:build_test` |
| `go_embed_src` | Embed-only assets for `//go:embed` that should not block `query`/`list`. | `:build`, `:build_test` |
| `go_test_data` | Files a test reads at runtime (fixtures, goldens).                      | `:test`, `:xtest`   |

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

### `go_embed_src` — embed assets excluded from package analysis

Label a target `go_embed_src` when it produces files referenced by `//go:embed`
that are expensive to build and should not run during `query`, `list`, or IDE
metadata operations.

Unlike `go_src`, outputs from `go_embed_src` targets are **not** staged during
package analysis (`_golist`). `heph query`, `heph list`, and editor integrations
complete without triggering the asset build. The files are staged only when the
package actually compiles.

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

The package's `//go:embed dist/*` is satisfied at compile time, without a frontend
build running during `query` or metadata operations.

`go_embed_src` respects `go_codegen_root` — embed-src targets are searched by
package prefix when a root is set, the same as `go_src`.

**Rule of thumb:** cheap assets (a few static files) → `go_src` is fine; expensive
assets (compiled frontend bundle, large binary) → `go_embed_src`.

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

**Rule of thumb:** code the package *imports* → `go_src`; expensive embed-only assets → `go_embed_src`; files a test *reads* → `go_test_data`.

## `provider_state` — per-package configuration

`provider_state(provider="go", ...)` placed in a BUILD file configures the go
provider for that package. `go_codegen_root` and `go_codegen_deps` always extend
to descendant packages. `test` and `link` apply to the exact declaring package by
default; set `recursive = True` to extend them to descendants. When the same key
applies at multiple depths, the **deepest (closest) applicable declaration wins**.

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
| `go_codegen_root` | `bool`                 | When `True` on an ancestor, `go_src` and `go_embed_src` targets are searched across the whole subtree rooted here (matched by package prefix) instead of only the leaf package. Use when one generator feeds many descendant packages. The deepest ancestor with this flag whose package is a prefix of the target's package is chosen. Always applies to descendants, independent of `recursive`. |
| `go_codegen_deps` | `list[string]`         | Explicit codegen target addresses injected into every descendant package's analysis/build sandbox. For generators that aren't labelled `go_src`. Honored independently of `go_codegen_root` (a BUILD setting only this still injects them). The closest ancestor carrying it wins. Always applies to descendants, independent of `recursive`. |
| `go_embed_deps`   | `list[string]`         | Explicit embed-asset target addresses injected into every descendant package's compile step. The analog of `go_codegen_deps` for the `go_embed_src` lane — for targets producing embed-only assets not labelled `go_embed_src`. The closest ancestor carrying it wins. |
| `test`            | `bool \| struct(...)` | `False` stops test-target generation for this package; `True` / unset runs them. The struct form configures `test`/`xtest` run targets — env vars and pre-run shell lines. Package-scoped by default; add `recursive = True` to extend to descendants. See below. |
| `link`            | `struct(...)`          | Link settings for a `main` package's `build` (binary) target: `flags`, `deps`, `runtime_deps`. Package-scoped by default; add `recursive = True` to extend to descendants. See below. |
| `recursive`       | `bool`                 | When `True`, extends this state's `test` and `link` config to all descendant packages. `go_codegen_root` and `go_codegen_deps` are unaffected — they always apply to descendants. |

### `test` — skipping and environment

**Bool form** (applies to the exact declaring package by default; add `recursive = True` to extend to descendants — the closest applicable declaration wins):

- `test = False` — disables test-target generation for this package (and descendants if `recursive = True`).
- `test = True` — (default) enables them. Overrides an ancestor's `test = False`.

**Struct form** (applies to the exact declaring package by default; add `recursive = True` to extend to descendants):

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

### `link` — binary link configuration

The `link` struct configures the `build` (binary) target generated for a
`package main`. Package-scoped by default; add `recursive = True` to extend to
descendant packages.

When multiple applicable states carry `link`, their values accumulate
shallow-to-deep: a recursive ancestor's flags, deps, and runtime deps are
collected first, then the package's own. `deps`/`runtime_deps` accumulate per
dep group (see "Naming dep groups" below).

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

**Naming dep groups:** a bare string or a list lands in the default group,
staged in the sandbox under the `link_deps` / `link_runtime_deps` key. Pass a
map instead to split `deps`/`runtime_deps` into named groups — each key is
used **verbatim** as the sandbox key its addresses are staged under, and a map
value can itself be a bare string (single address) or a list:

```python title="BUILD"
provider_state(
    provider = "go",
    link = {
        "deps": {
            "assets": ["//embed:assets"],
            "icons":  "//embed:icons",   # bare string == single-address group
        },
    },
)
```

The same group name declared on a recursive ancestor and on the package itself
merges shallow-to-deep; different group names stay separate. Because named
groups are staged verbatim (not namespaced), avoid reusing the plugin's own
internal group names (`link_deps`, `link_runtime_deps`, `lib_*`, `gosdk`) — a
collision merges your addresses into that internal group instead of a distinct
one.

### How source/embed resolution actually composes

**Analysis source set** (staged into `_golist` so `go list` sees them):

1. A filesystem glob of all non-`.go` files in the package (checked-in assets).
2. A `label=go_src` query — scoped to the leaf **package**, or the **package
   prefix** of the chosen `go_codegen_root` — whose full output tree is unpacked.
3. The `go_codegen_deps` from the closest ancestor BUILD state.

**Compile embed source set** (staged only at compile time, never in `_golist`):

4. A `label=go_embed_src` query — same scoping rules as step 2.
5. The `go_embed_deps` from the closest ancestor BUILD state.

Items 4 and 5 are deliberately excluded from `_golist`, so `query`/`list`/IDE
metadata never trigger expensive asset builds. They only run when `go_compile`
actually needs the bytes to satisfy `//go:embed` patterns.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `heph query all <pkg>` shows no `:build`/`:test` | go plugin not registered, or pkg under a `skip` glob | Add the plugin entry; check `options.skip`. |
| Provider errors: `` `gotool` is required `` | `gotool` option missing | Add `gotool: "<version>"` or `gotool: "host"` to `options`. |
| Build fails: undefined symbol from generated code | generator not labelled `go_src`, or it's in another package without `go_codegen_root` | Label it `go_src`; if cross-package, add `go_codegen_root=True` at the covering root. |
| `//go:embed` finds nothing | embedded asset not produced/labelled | Label the producing target `go_src` (cheap assets) or `go_embed_src` (expensive assets). |
| `query`/`list`/IDE is slow because of an embed asset build | embed asset is labelled `go_src` — it runs during analysis | Relabel it `go_embed_src`; the build will only run at actual compile time. |
| Test panics: open testdata/...: no such file | fixture not staged into the sandbox | Label the producing target `go_test_data`. |
| Wrong/old third-party version compiled | `go.mod` version drift vs the generated `@version` address | Reconcile `go.mod`; the address (and thus cache key) follows the pinned version. |
| Non-reproducible builds across machines | using `gotool = "host"` | Switch to a pinned version: `gotool: "1.26.4"` and add `checksums`. |
| SDK checksum mismatch | `checksums` entry doesn't match the tarball | Look up the correct SHA-256 at https://go.dev/dl/?mode=json. |
| `test = False` unexpectedly not disabling descendants | missing `recursive = True` | Add `recursive = True` to the `provider_state` to extend to descendants. |
| A named `link` dep group ends up merged with the plugin's own deps | named group reused an internal group name (`link_deps`, `lib_*`, `gosdk`, …) | Rename the group — named groups are staged verbatim, not namespaced. |

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
