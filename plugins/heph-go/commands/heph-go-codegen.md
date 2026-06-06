---
name: heph-go-codegen
description: Wire generated Go code and test fixtures into a package via go_src, go_codegen_root, go_codegen_deps, and go_test_data.
---

You are wiring generated code or test fixtures into a Go package under heph so
`:build`/`:test` see them. Use the `heph-go` skill (`references/go-plugin.md`).

The user's request / context: $ARGUMENTS

First classify what's being wired — this decides everything:

- **Code the package imports** (protobuf stubs, mocks, `stringer`, `//go:embed`
  assets) → `go_src`.
- **Files a test reads at runtime** (golden files, sample inputs, fixture DBs) →
  `go_test_data`.

### Generated source in the same package → `go_src`

Label the codegen target `go_src`; its full output tree is unpacked into the
package before analysis, so the build and tests compile it as if committed.

```python title="<pkg>/BUILD"
target(
    name = "<gen>",
    driver = "bash",
    codegen = "copy",          # also land files in the tree for editors/gofmt
    labels = ["go_src"],
    deps = {"src": glob("<inputs>")},
    out = glob("<generated outputs>"),
    run = "<generator command>",
)
```

Then `heph tool gen-gitignore` to keep `copy` outputs untracked. No `deps` entry
on `:build` — the label is the wiring.

### Generator feeds many packages, or isn't labelled `go_src` → `provider_state`

Put this in a BUILD at the covering root (applies to all descendant packages;
deepest ancestor wins):

```python title="<root>/BUILD"
provider_state(
    provider = "go",
    go_codegen_root = True,                 # search go_src across the whole subtree
    go_codegen_deps = ["//tools/x:gen"],    # codegen targets NOT labelled go_src
)
```

Use `go_codegen_root` when one generator's output covers many descendant
packages. Use `go_codegen_deps` for generators you can't/won't label `go_src`.

### Test fixtures → `go_test_data`

Label the producing target so its outputs are staged into the `:test`/`:xtest`
sandbox:

```python title="<pkg>/BUILD"
target(
    name = "fixtures",
    driver = "bash",
    labels = ["go_test_data"],
    deps = {"src": glob("<fixture inputs>")},
    out = glob("testdata/*"),
    run = "<fixture generator>",
)
```

### Then verify

```bash
heph inspect deps //<pkg>:build    # go_src edge present?
heph run //<pkg>:build             # compiles with generated code
heph run //<pkg>:test              # tests see code + fixtures
heph run //<gen>:<name> --shell    # (bash/sh) inspect the codegen sandbox
```

Produce the BUILD diff, state exactly which BUILD file each block goes in
(inheritance makes location matter), explain each label/knob in one line, and end
with the verification commands. Never add generated code through `deps` — wire it
via the label so it reaches `go list` and embed resolution.
