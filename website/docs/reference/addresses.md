---
title: "Addresses"
sidebar_position: 3
description: How targets are named — package, name, output-group selector, and the built-in @heph packages.
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

When you run `heph` from inside a package directory, you can omit the `//pkg`
prefix. heph resolves the address against the **current package** — the package
whose `BUILD` file is in the nearest ancestor directory.

| Form | Resolves to |
|------|-------------|
| `:name` | `//current-pkg:name` |
| `name` | `//current-pkg:name` |
| `./sub:name` | `//current-pkg/sub:name` |
| `../sibling:name` | `//parent/sibling:name` |

```bash title="terminal"
# Inside //app/server
heph run :build            # runs //app/server:build
heph run build             # same
heph run ./handlers:test   # runs //app/server/handlers:test
heph run ../shared:lib     # runs //app/shared:lib
```

Relative forms also apply to exclude flags passed to `heph run`.

:::note
Absolute addresses (`//pkg:name`) always work regardless of the working
directory and are required when referencing targets inside `BUILD` files.
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
