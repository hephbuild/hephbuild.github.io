---
name: heph-go
description: >-
  Set up and maintain Go in a heph workspace so it builds and tests correctly.
  Use this skill whenever the user is working with Go code under heph: enabling
  the `go` provider and the `go_golist`/`go_embed`/`go_testmain` drivers in
  .hephconfig, building or testing Go packages (`heph run //pkg:build`,
  `//pkg:test`, `//pkg:xtest`), wiring generated `.go` code into a package
  (the `go_src` label, `go_codegen_root`, `go_codegen_deps`), staging test
  fixtures (`go_test_data`), skipping directories from Go discovery, pointing at
  a specific Go toolchain (`gotool`), cross-compiling for another platform
  (address args / `heph.go.build_addr`), skipping tests, or debugging why a Go
  package fails to find generated code, embeds, third-party modules, or testdata.
  Also use it when a go.mod / *.go file is present and the task is "make Go work
  under heph" even if the user does not say "heph" explicitly.
version: 0.1.1
---

# heph + Go setup

The **go provider** gives heph native Go support. It walks the workspace, reads
each package's `go.mod` and sources, and **generates** the targets to compile
and test it — you never hand-write `target()` for Go code. Your job is to set it
up correctly and to *label* the few things heph can't infer: generated code and
test fixtures.

> Canonical docs: <https://hephbuild.github.io/docs/plugins/go> · LLM index:
> <https://hephbuild.github.io/llms.txt>. When a flag, label, or option must be
> exactly right, fetch the live `go.md` page rather than guessing.

This skill assumes the general heph model (targets, sandbox, cache hits,
codegen). If you need it, the companion `heph-expert` plugin carries the full
reference; here we focus only on Go.

## The one-paragraph model

For each Go package the provider emits, among others, two targets you care about:

| Target   | Builds                                              | Labels            |
|----------|----------------------------------------------------|-------------------|
| `:build` | The library, or the binary for `package main`.     | —                 |
| `:test`  | The package's tests.                               | `test`, `go-test` |

Imports are resolved automatically into two generated address families —
`//@heph/go/std/<pkg>` (stdlib) and
`//@heph/go/thirdparty/<module>@<version>` (pinned modules). Because the version
is in the address, bumping a dependency invalidates only the targets that import
it. You read these addresses; you never write them.

```bash title="terminal"
heph query all .              # see what was generated for this package
heph run //cmd/server:build   # compile the binary
heph run //lib/auth:test      # run the package's tests
```

## Step 1 — enable it in `.hephconfig`

The provider is **opt-in**; its three managed drivers must be enabled too, or
generated targets won't run.

```yaml title=".hephconfig"
providers:
  - name: go
    options:
      gotool: "//@heph/bin:go"   # optional; this is the default

drivers:
  - name: go_golist     # package metadata analysis (go list)
  - name: go_embed      # //go:embed processing
  - name: go_testmain   # generated test main
```

| Option   | Type       | Default            | Purpose |
|----------|------------|--------------------|---------|
| `gotool` | `string`   | `"//@heph/bin:go"` | Address of the Go binary target. Point it at a pinned toolchain (e.g. a `nix` or `hostbin` target) for reproducibility. |
| `skip`   | `string[]` | `[]`               | Workspace-relative globs of directories to exclude from Go discovery (vendored trees, generated stubs, non-module code). |

```yaml title=".hephconfig"
providers:
  - name: go
    options:
      skip:
        - vendor
        - "internal/generated/**"
```

If `heph query all <pkg>` shows no `:build`/`:test`, the usual cause is a missing
driver registration or the package sitting under a `skip` glob.

## Step 2 — wire generated code with `go_src`

A package often needs `.go` files that aren't hand-written: protobuf stubs,
mocks, `stringer` enums, embedded assets. Don't add them to `deps`. **Label the
codegen target `go_src`** and the provider unpacks its output tree into the
package *before analysis*, so `go list`, the build, and the tests all compile
the generated files as if committed.

```python title="api/BUILD"
target(
    name = "proto",
    driver = "bash",
    codegen = "copy",          # also land files in the tree for editors / gofmt
    labels = ["go_src"],       # ← this is what wires it into :build and :test
    deps = {"src": glob("*.proto")},
    out = glob("*.pb.go"),
    run = "protoc --go_out=. $SRC_SRC",
)
```

```bash title="terminal"
heph run //api:build   # compiles your sources + the generated .pb.go
heph run //api:test    # tests see the generated code too
```

No `deps` entry on `:build`, no reference to `:proto` anywhere — the label is the
whole wiring. Pair `go_src` with `codegen = "copy"` so the files also exist for
your editor, and run `heph tool gen-gitignore` to keep them out of git.

## Step 3 — codegen that lives elsewhere: `go_codegen_root` & `go_codegen_deps`

`go_src` works when the codegen target sits **in the same package**. When
generated `.go` files for many packages come from one place, or the generator
isn't labelled `go_src`, use **`provider_state`** in a BUILD file. State set in a
BUILD file applies to that package **and all descendants**; the *deepest* (closest)
ancestor wins.

```python title="BUILD"  # at the codegen root, e.g. repo root or a subtree
provider_state(
    provider = "go",
    go_codegen_root = True,        # search for go_src targets across this whole subtree,
                                   #   not just the leaf package
    go_codegen_deps = [           # explicit codegen targets that are NOT labelled go_src
        "//tools/mockgen:mocks",
    ],
)
```

- **`go_codegen_root = True`** — widens the `go_src` search so a single generator
  feeding many descendant packages is found from each of them (the query matches
  by package *prefix* from the root, instead of only the leaf package).
- **`go_codegen_deps = [...]`** — injects explicit codegen target addresses into
  every descendant package's analysis sandbox. Use it for generators that don't
  (or can't) carry the `go_src` label. It is honored independently of
  `go_codegen_root` — a BUILD declaring only `go_codegen_deps` still injects them.

## Step 4 — test fixtures with `go_test_data`

Tests that read files at runtime (golden files, sample inputs, a fixture DB)
only see what the package declares — the sandbox is isolated. **Label the target
that produces those files `go_test_data`** and its outputs are staged next to the
test binary when `:test` / `:xtest` runs, without loosening isolation.

```python title="parser/BUILD"
target(
    name = "fixtures",
    driver = "bash",
    labels = ["go_test_data"],         # ← staged into :test / :xtest sandbox
    deps = {"src": glob("schema/*.json")},
    out = glob("testdata/*.golden"),
    run = "./gen-goldens.sh",
)
```

```bash title="terminal"
heph run //parser:test   # the .golden files are present at the expected path
```

`go_src` → compiled into the package (build + test). `go_test_data` → present at
runtime for tests only. Picking the wrong label is the most common Go setup bug:
generated **code** the package imports needs `go_src`; files a test merely
**reads** need `go_test_data`.

## Step 5 — skipping tests

To stop the provider from emitting test targets for a subtree, set `test.skip`
via `provider_state`. Deeper states override shallower ones, so you can disable
broadly and re-enable in a leaf.

```python title="vendor/BUILD"
provider_state(provider = "go", test = {"skip": True})
```

```python title="vendor/active/BUILD"  # re-enable for one subtree
provider_state(provider = "go", test = {"skip": False})
```

## Quick reference

| You want to…                                   | Do this |
|------------------------------------------------|---------|
| Turn on Go support                             | `providers: [{name: go}]` + register `go_golist`, `go_embed`, `go_testmain` under `drivers:` |
| Use a pinned Go toolchain                      | `options.gotool = "//path/to:go"` |
| Hide a directory from Go discovery             | `options.skip: ["vendor", "…/**"]` |
| Compile generated `.go` in the same package    | label the codegen target `go_src` (+ `codegen = "copy"`) |
| Feed one generator to many packages            | `provider_state(provider="go", go_codegen_root=True)` at the root |
| Pull in codegen not labelled `go_src`          | `provider_state(provider="go", go_codegen_deps=[…])` |
| Give a test its fixtures/goldens               | label the producing target `go_test_data` |
| Skip tests for a subtree                       | `provider_state(provider="go", test={"skip": True})` |

## Operating rules

1. **Never `target()` Go code.** The provider generates `:build`/`:test`. If you
   feel the urge to hand-write a compile target, the real need is a label
   (`go_src` / `go_test_data`) or a `provider_state` knob.
2. **Code vs data.** Imported `.go` (and `//go:embed` assets) → `go_src`. Files a
   test reads at runtime → `go_test_data`. Don't mix them up.
3. **Labels over deps.** Don't add generated code to a package via `deps` — heph
   wires it from the label. Adding it manually fights the provider.
4. **State is inherited; deepest wins.** `provider_state` flows to descendant
   packages; a closer BUILD overrides a farther one. Put `go_codegen_root` at the
   smallest subtree that covers the generator and its consumers.
5. **Verify, don't assume.** `heph query all <pkg>` lists the generated targets;
   `heph inspect deps //pkg:build` shows whether the `go_src`/std/thirdparty edges
   landed; `heph run //pkg:build --shell` (bash/sh codegen targets) reproduces the
   sandbox to see exactly which files arrived. Diagnose with these before editing.
6. **Keep it reproducible.** Pin `gotool`; keep codegen deterministic; prefer
   `codegen = "copy"` + `gen-gitignore` for generated sources.
