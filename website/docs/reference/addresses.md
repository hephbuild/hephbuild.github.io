---
title: "Addresses"
sidebar_position: 3
description: How targets are named — absolute, relative, output-group selector, and the built-in @heph packages.
---

# Addresses

Every target has an **address**: the `//`-prefixed path that names it across the
whole workspace. You use addresses on the command line and wherever one target
references another.

```text
//app:server
//lib/auth:lib
//proto:api
```

## Anatomy

```text
//lib/auth:lib
  └──┬──┘ └┬┘
  package  name
```

- **package** — the workspace-relative directory, after the `//`. The root
  package is the empty string, written `//:name`.
- **name** — the target's name within that package, after the `:`.

## Relative addresses

Inside a `BUILD` file or when passing an address to a command from within a
package directory, you can use relative forms instead of the full `//pkg:name`
path. All relative forms require an explicit prefix — a bare identifier like
`name` is **not** a valid address.

| Form | Resolves to | Example |
|------|-------------|--------|
| `:name` | Current package | `:server` → `//app:server` from `app/` |
| `./subdir:name` | Subdirectory of current package | `./cmd:bin` → `//app/cmd:bin` from `app/` |
| `../sibling:name` | Sibling package | `../lib:core` → `//lib:core` from `app/` |

```python title="BUILD"
# Inside app/BUILD — all three are equivalent ways to reference //app:compile:
lib = target(name = "compile", ...)

target(
    name = "server",
    deps = [
        lib,           # Python variable — always preferred
        ":compile",    # explicit relative form
        "//app:compile",  # absolute form
    ],
    ...
)
```

:::tip
Using the Python variable returned by `target()` is the most concise and
refactor-safe way to reference a target defined in the same file. Relative
string forms like `:name` are useful when referencing a target defined in
another file within the package.
:::

## Output-group selector

A target can publish several [output groups](/docs/plugins/exec#output-groups).
Append `|group` to an address to depend on just one of them:

```text
//app:compile|bin     # only the "bin" group of //app:compile
```

Without a selector, the address refers to the target's default output group.

## Built-in `@heph/*` packages

Some plugins expose targets under reserved `@heph/*` packages. They are resolved
on demand — you reference them, you don't define them.

| Address | Owned by | Purpose |
|---------|----------|---------|
| `//@heph/bin:<tool>` | [Hostbin](/docs/plugins/hostbin) | Wrap a binary already on the host `PATH`. |
| `//@heph/fs:file@f=<path>` | [Filesystem](/docs/plugins/fs) | Reference a single workspace file. |
| `//@heph/fs:glob@p=<pattern>@e=<excludes>` | [Filesystem](/docs/plugins/fs) | Reference files by glob. |
| `//@heph/query:<name>@<matchers>` | [Query](/docs/plugins/query) | Group targets selected by label, package, or prefix. |
| `//@heph/go/std/<pkg>` | [Go](/docs/plugins/go) | A Go standard-library package. |
| `//@heph/go/thirdparty/<module>@<version>` | [Go](/docs/plugins/go) | A pinned third-party Go module. |
| `//@heph/introspect:outputs` | engine | A target's own declared outputs, used by in-place [codegen](/docs/concepts/codegen). |

:::tip
You rarely type the `@heph/fs` addresses by hand — the `file()` and `glob()`
[builtins](/docs/plugins/buildfile#authoring-build-files) generate them. The
[query](/docs/plugins/query) and [go](/docs/plugins/go) addresses are likewise
produced for you; the table is here so you can recognize them in a dependency
graph.
:::
