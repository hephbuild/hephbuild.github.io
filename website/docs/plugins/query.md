---
title: "Query"
sidebar_position: 9
description: Dynamic target selection with a composable query language — boolean operators, label/package predicates, and the query() BUILD-file builtin.
---

# Query

The query plugin selects targets dynamically. Instead of listing targets by
address, you write a predicate — a boolean expression over labels, package
paths, and addresses — and heph resolves the matching set for you. New targets
that satisfy the predicate are picked up automatically as the repo grows;
targets that no longer match drop out without anyone editing a list.

A query expands into a **group** of matching targets, so you can pass it
anywhere a list of targets is accepted. See [group](/docs/plugins/group) for
how groups execute.

## Provider

A **provider** is a plugin that contributes targets to the graph without
registering its own execution driver — the targets it emits run on an existing
driver. The query plugin is a provider: it emits group targets that run on the
`group` driver. It registers **no** driver of its own.

## Enabling it

Built-in and always-on; no registration required in `.hephconfig`.

## Query language

Queries are written in a small expression language.

### Patterns

| Pattern | Matches |
|---------|---------|
| `//pkg` | exactly package `//pkg` |
| `//pkg/...` | `//pkg` and every package beneath it |
| `//pkg:name` | the single target `//pkg:name` |
| `.` | the current package |
| `./sub` | the sub-package relative to the current directory |
| `../sibling` | a sibling package |

A bare `//foo` (no `:`) is a **package** matcher. To match a specific target
address, include the colon: `//foo:bar`.

### Functions

| Function | Matches |
|----------|---------|
| `label(x)` | targets that carry label `x` |
| `addr(//pkg:name)` | the target at that address |
| `package(//pkg)` | targets in exactly that package |
| `package_prefix(//pkg)` | targets in `//pkg` or any sub-package |
| `tree_output(pkg)` | targets whose codegen tree writes into `pkg` |

Labels containing spaces can be quoted: `label("my label")`.

### Operators

| Operator | Meaning |
|----------|---------|
| `a && b` | both must match |
| `a \|\| b` | either must match |
| `!a` | negate |
| `(…)` | grouping |

Precedence: `!` binds tightest, then `&&`, then `||`. Use parentheses to
override.

### Grammar

```text
or   := and ( "||" and )*
and  := not ( "&&" not )*
not  := "!" not | atom
atom := "(" or ")" | func | pattern
```

### Examples

```bash
# All lint targets under //cmd, excluding the vendor subtree
heph run -e '//cmd/... && label(lint) && !//cmd/vendor/...'

# Every target in either //a or //b
heph query -e '//a/... || //b/...'

# Targets generating code for the gen package
heph run -e 'tree_output(gen)'

# Combine group membership with a codegen scope
heph run -e '(//a/... || //b/...) && tree_output(gen)'
```

## CLI: `-e` / `--expr`

`heph run` and `heph query` accept `-e <EXPR>` (long form `--expr`) as an
alternative to a positional target address. The flag and the positional
arguments are mutually exclusive — use one or the other.

```bash
heph run //pkg:name                  # positional address (unchanged)
heph run label //pkg/...             # label + package matcher (unchanged)
heph run -e '//pkg/... && label(ci)' # query expression

heph query -e '//... && !//vendor/...'
```

:::note
The old `-e`/`--exclude` flag was removed. Use `!` inside a query expression
to exclude targets — for example `//... && !//vendor/...`.
:::

## `query()` in BUILD files

The `query()` builtin lets a BUILD file select targets dynamically, the same
way `file()` and `glob()` select files. Pass a query expression; `query()`
returns an address that the engine expands at build time.

```python title="BUILD"
# Build every target with the lint label in this subtree
target(
    name = "lint-all",
    driver = "group",
    deps = [query("//... && label(lint)")],
)
```

Relative patterns in a `query()` expression resolve against the package that
contains the BUILD file. `query()` sees sibling targets in the same BUILD
file — it opts out of the engine's automatic provider exclusion so the query
can enumerate its own package.

```python title="app/BUILD"
lib  = target(name = "lib",  driver = "bash", run = "...", out = "lib",  labels = ["lint"])
test = target(name = "test", driver = "bash", run = "...", out = "test", labels = ["lint"])
util = target(name = "util", driver = "bash", run = "...", out = "util")

# Selects //app:lib and //app:test; //app:util has no lint label.
target(
    name = "lint",
    driver = "group",
    deps = [query("label(lint)")],
)
```

## `@heph/query` addresses

Under the hood, `query()` and `-e` both produce `@heph/query` addresses. The
address format is:

```text
//@heph/query:query@expr=<expression>
```

You rarely need to write these by hand — `query()` and `-e` generate them for
you. The table in [Addresses → Built-in `@heph/*` packages](/docs/reference/addresses#built-in-heph-packages)
lists them for reference.
