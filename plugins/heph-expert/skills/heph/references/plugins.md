# heph plugins, drivers, providers & addresses

Almost everything heph does comes from **plugins**. A plugin is either a
**driver** (a named executor a target references via `driver = "..."`) or a
**provider** (it discovers/generates targets and registers no driver of its
own). Sources under `https://hephbuild.github.io/docs/plugins/` and
`.../reference/addresses.md`.

## Contents
- [Drivers](#drivers)
- [Language plugins](#language-plugins)
- [Providers](#providers)
- [Addresses & the `@heph/*` packages](#addresses--the-heph-packages)
- [Per-plugin detail](#per-plugin-detail)

---

## Drivers

| Plugin | Driver(s) | Purpose | Registration |
|---|---|---|---|
| Exec | `exec`, `bash`, `sh` | Run shell commands in sandboxed builds; interactive `--shell` debugging. | Built-in; list under `drivers:`. |
| Filesystem | `fs` | Reference workspace files/globs as inputs. | Built-in, always on. |
| Group | `group` | Bundle targets transparently (pass-through), no extra work. | Built-in, always on. |
| Hostbin | `hostbin` | Wrap a host `PATH` binary as a target. | Built-in, always on. |
| Nix | `nix` | Build reproducible tool environments via Nix flakes. | Opt-in; register under `drivers:`. Needs `nix` on PATH with flakes. |
| Textfile | `textfile` | Generate text files, optionally executable. | Built-in. |

## Language plugins

| Plugin | Driver(s) | Purpose |
|---|---|---|
| Go | `go_golist`, `go_embed`, `go_testmain` | Go support: libraries, binaries, tests. Drivers are internal — you don't call them directly. |

## Providers

| Plugin | Purpose | Registration |
|---|---|---|
| Buildfile | Scan the workspace for Starlark BUILD files and parse `target()` definitions. | Built-in; register under `providers:`. |
| Query | Select targets dynamically by label/package/prefix/output, returning a group. | Built-in, always on. |
| Go | Analyze Go packages and generate build/test targets (also registers the `go_*` drivers). | Opt-in; register under `providers:`. |

## Addresses & the `@heph/*` packages

```
//lib/auth:lib
  └──┬──┘ └┬┘
  package  name        # package = workspace-relative dir after //; root = //:name
```

- **Output-group selector:** append `|group` to depend on one published group,
  e.g. `//app:compile|bin`. Without a selector you get the default group.
- **Built-in `@heph/*` packages** are resolved on demand — you reference them,
  you don't define them. You rarely type the `fs` ones by hand; `file()` /
  `glob()` generate them, and the `query`/`go` ones are produced for you.

| Address | Owned by | Purpose |
|---|---|---|
| `//@heph/bin:<tool>` | Hostbin | Wrap a binary already on the host `PATH`. |
| `//@heph/fs:file@f=<path>` | Filesystem | Reference a single workspace file. |
| `//@heph/fs:glob@p=<pattern>@e=<excludes>` | Filesystem | Reference files by glob. |
| `//@heph/query:<name>@<matchers>` | Query | Group targets selected by label/package/prefix. |
| `//@heph/go/std/<pkg>` | Go | A Go standard-library package. |
| `//@heph/go/thirdparty/<module>@<version>` | Go | A pinned third-party Go module. |
| `//@heph/introspect:outputs` | engine | A target's own declared outputs (in-place codegen). |

## Per-plugin detail

### Exec (`exec` / `bash` / `sh`)
Full field list, dependency kinds, output groups and sandbox env vars are in
`authoring.md`. `path` option sets the `PATH` override (default
`/usr/local/bin:/usr/bin:/bin`).

### Nix (`nix`)
Builds a reproducible environment from a `nixpkgs` flake URL and exposes
selected `programs` as tool binaries; consume via another target's `tools`.

```python title="BUILD"
nix_tools = target(
    name = "nix_tools",
    driver = "nix",
    nixpkgs = "github:NixOS/nixpkgs/nixos-unstable",
    packages = ["pkgs.ripgrep"],
    programs = ["rg"],
)
target(name = "check", driver = "bash", tools = nix_tools, run = ["rg --version"])
```
Pin the `nixpkgs` URL to a commit for reproducibility. Remote caching is
disabled (wrappers reference host-local `/nix/store` paths). Requires
`nix-command` + `flakes`. Use `system` to override host-system detection.

### Go (provider)
Analyzes each package from `go.mod` + sources and generates targets — you don't
write `target()` for Go code. Per package: `:build` (library, or binary for
`package main`) and `:test` (labels `test`, `go-test`). Imports are wired
automatically through the `@heph/go/std/*` and
`@heph/go/thirdparty/<module>@<version>` address families; because the version
is in the address, a dependency bump invalidates only importers.

```yaml title=".hephconfig"
providers:
  - name: go
    options:
      gotool: "//@heph/bin:go"   # optional, this is the default
drivers:
  - name: go_golist
  - name: go_embed
  - name: go_testmain
```
```bash
heph query all .             # explore generated targets for the current package
heph run //cmd/server:build  # compile the binary
heph run //lib/auth:test     # run the package's tests
```

Generated code and test data are wired in by **label**, not by hand:
- **`go_src`** — label a codegen target (typically `codegen = "copy"`) whose
  output is generated `.go`; its tree is unpacked into the package, so `:build`
  and `:test` compile it as if committed (proto stubs, mocks, `stringer`). No
  `deps` entry needed.
- **`go_test_data`** — label a target producing files a test reads at runtime
  (golden files, fixtures); its outputs are staged into the sandbox for `:test`
  and `:xtest`, keeping tests isolated and reproducible.
```python title="api/BUILD"
target(name = "proto", driver = "bash", codegen = "copy",
       labels = ["go_src"], deps = {"src": glob("*.proto")},
       out = glob("*.pb.go"), run = "protoc --go_out=. $SRC_SRC")
```

### Buildfile (provider)
Scans for BUILD files (default name `BUILD`; customize via `patterns`). `skip`
excludes directories from the walk (vendored code, generated trees, etc.).
Authoring details in `authoring.md`.

### Query (provider)
Address the `@heph/query` package with matcher args; combining matchers is AND
logic. Returns a `group` target.
```
//@heph/query:lint-targets@label=lint
//@heph/query:tools@package=src/tools
//@heph/query:cmd@package_prefix=cmd,exclude_provider=go
//@heph/query:fast-tests@package_prefix=tests,label=fast
```

### Group / Filesystem / Hostbin / Textfile
- **Group:** bundle several targets as a single transparent, pass-through
  dependency.
- **Filesystem:** the `fs` driver; surfaces workspace files/globs as inputs
  (the target side of `file()`/`glob()`).
- **Hostbin:** wraps host binaries as targets via generated wrapper scripts —
  referenced as `//@heph/bin:<tool>`.
- **Textfile:** the `textfile` driver; generate a text file from inline content,
  optionally marked executable.
