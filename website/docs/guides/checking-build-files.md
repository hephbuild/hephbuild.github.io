---
title: "Checking BUILD files"
sidebar_position: 5
description: Typecheck and format-check BUILD files with the build-lint-check, build-format-check and build-format targets every package gets.
---

# Checking BUILD files

Every package with a BUILD file gets three targets. They are always on, and
need no setup beyond the `buildfile` plugin:

| Target | Does | Writes | Labels |
|---|---|---|---|
| `//<pkg>:build-lint-check` | Statically typechecks the package's own BUILD files. With [`requireTypeAnnotations`](#requiring-type-annotations), also requires a type on every `def` parameter. | nothing | `build-lint-check`, `lint-check` |
| `//<pkg>:build-format-check` | Fails when a file differs from the formatter's output, the same rule as `heph tool build-fmt --check`. | nothing | `build-format-check`, `format-check` |
| `//<pkg>:build-format` | Rewrites the package's files to the formatter's output. | the package's BUILD files | `build-format`, `format`, `fix` |

The labels match the Go plugin's, so one label run covers both languages. All
three are cached locally, never remotely.

```bash title="terminal"
heph run //pkg:build-lint-check     # typecheck one package
heph run //pkg:build-format         # format one package in place
heph run -e 'label(fix)'            # apply every fix in the workspace
```

:::warning
`//...` includes `build-format`, so `heph run //...` rewrites every unformatted
BUILD file in place. It also includes the two checks, which fail on an
unformatted file or a type error.
:::

`heph tool build-fmt` stays: use it for ad-hoc and editor formatting, and
`build-format` for the cached gate. Both produce the same output. See
[Formatting BUILD files](./formatting-build-files.md).

## In CI

```bash title="terminal"
heph validate && heph run -e 'label(lint-check) || label(format-check)'
```

A bare `label()` in `-e` selects across the whole workspace, wherever it is run
from. Run `heph validate` first: it is what reports a
[shadowed check](#shadowing).

## What the typecheck covers

`build-lint-check` checks without executing anything, and it checks only the
**body of each `def`**. Top-level statements are not statically checked:

```python title="BUILD"
def lib(name: str) -> None:
    n: int = name          # reported: type-error, inside a def

x: int = "s"               # not reported: top level
lib(1)                     # not reported: top level
```

A bad top-level statement still fails: evaluation runs it with runtime type
checks, so `heph run`, `heph query` and `heph validate` report it. A passing
`build-lint-check` means every def body typechecks, not the whole file.

Lambdas cannot be annotated, so they are exempt.

## Inferred types

Two types are inferred, so their annotations are optional and calls are still
checked against them:

- **The return type** of a top-level `def`: the union of what its `return`s
  give, plus `None` when the body can run off its end.
- **A parameter with a literal default** takes the literal's type:

| Default | Inferred type |
|---|---|
| `1`, `-1` | `int` |
| `1.5`, `-1.5` | `int \| float` (same as `heph.types.Number`) |
| `"s"` | `str` |
| `True`, `False` | `bool` (only while the file never rebinds `True`/`False`) |
| `[]`, `{}`, `()` | a list, dict or tuple with unchecked elements |

Any other default infers nothing, so the parameter needs an annotation: `None`,
a name (`x = DEFAULT`), a call, an operator (`1 + 1`, `not True`), and `...`.

An annotation always wins over the default. To accept more than the default's
type, annotate the parameter:

```python title="defs.BUILD"
def scaled(n: heph.types.Number = 1): ...        # accepts a float too
def named(name: str | None = ""): ...            # accepts None
def lib(deps: heph.types.Deps = []): ...         # accepts one address or a map
```

Only `build-lint-check` checks inferred types. Evaluation checks annotations
alone, so it accepts any argument for a parameter typed only by its default.

### Allowing `None`

A parameter takes `None` only when its annotation says `| None`, or when it is
a [field alias](#hephtypes), which includes `None`. An inferred type never
includes `None`.

| Parameter | Takes `None` | Type checked by |
|---|---|---|
| `s: str` | no | lint and evaluation |
| `s: str \| None = None` | yes | lint and evaluation |
| `s = ""` | no | lint only |
| `s = None` | yes, and any other value | nothing; `requireTypeAnnotations` reports it |
| `deps: heph.types.Deps = None` | yes | lint and evaluation |
| `n: heph.types.Number \| None = None` | yes; `heph.types.Number` alone does not | lint and evaluation |

## `heph.types`

`heph.types.X` names what `target()` accepts for one field, so a wrapper `def`
can type the parameters it passes through instead of falling back to
`**kwargs`:

```python title="defs.BUILD"
def lib(name: str, deps: heph.types.Deps = None, labels: heph.types.Labels = None):
    target(name = name, driver = "bash", run = "true", labels = labels, transitive = {"deps": deps})
```

| Alias | Means |
|---|---|
| `Addr`, `Deps`, `Env`, `Labels`, `PassEnv`, `RuntimePassEnv`, `Tools` | What `target()` accepts for that field, **`None` included** |
| `Number` | `int \| float`; does not include `None` |

A field alias widens with its field and never narrows. `transitive` and
`approval` have no alias. An unknown name such as `heph.types.Nope` fails
before evaluation and lists the known aliases. In the editor, `heph.types.`
completes and each alias shows its expansion on hover.

`target(labels = None)` means labels left out, so a wrapper can pass
`labels: heph.types.Labels = None` straight through.

## Requiring type annotations

Turn on `requireTypeAnnotations` to require a type on every `def` parameter,
`*args` and `**kwargs` included. The return type may be left out, and so may
the type of a parameter with a literal default other than `None` (see
[Inferred types](#inferred-types)).

```yaml title=".hephconfig"
plugins:
  - builtin: buildfile
    options:
      requireTypeAnnotations: true   # default false
```

The typecheck always runs; only the annotation rule sits behind the option.
With it on, the [editor](./editor-setup.md) also marks each missing annotation
at its parameter. Type errors are not shown in the editor; only
`build-lint-check` reports them.

:::note
A profile's `builtin: buildfile` entry replaces the base entry wholesale, so it
must repeat `requireTypeAnnotations` (and `patterns`, `indent`) to keep them.
:::

## Reading a failure

One line per finding, sorted by file, line and column, then a count line:

```text
pkg/BUILD:3:9: annotation: parameter `x` of `make_lib` has no type; add `: <type>`
pkg/defs.BUILD:12:5: type-error: Expected type `str` but got `int`
2 findings in //pkg
annotations are required by requireTypeAnnotations in .hephconfig (plugins: buildfile, options)
```

The last line appears only when there is an `annotation:` finding. A parameter
named like a field alias (`deps`, `labels`, …) gets that alias suggested.

`build-format-check` prints a `format: not formatted` line per file, naming the
first line that differs, and ends with `run heph run //pkg:build-format to fix`.

The lines go to the target's failure log. Read it with
`heph inspect failure <addr>`, or get its path with
`heph inspect failure --json <addr>`. See
[Failure outputs](./failure-outputs.md).

## Which package checks a file

A file is checked and formatted by the package whose directory holds it, never
by a package that only loads it. A loaded file's types still apply to the calls
made to it.

- **Name shared helpers `*.BUILD`.** A `defs.BUILD` next to a BUILD file belongs
  to that package, so it is checked and formatted.
- **Unowned files are not checked.** A non-BUILD file (`defs.star`) that only
  other packages load, or a loaded file in a directory with no BUILD file, is
  never checked itself. Editing it still re-runs every check that loads it.
- **Symlinked files are never checked or formatted** by the package holding the
  link, only by the package that owns the link's target, if any.

## Shadowing

There are no reserved names. A target you declare as `build-format`,
`build-format-check` or `build-lint-check` shadows the check: `heph run //...`
runs your target instead. `heph validate` fails on every such conflict, names
where the target was declared, and tells you to rename or remove it.

## What changes on upgrade

- `heph run //...` now formats BUILD files in place and can fail on type errors
  or unformatted files.
- `label(fix)` and `label(format)` now include `build-format`;
  `label(lint-check)` and `label(format-check)` now include the BUILD checks.
- Calls to an unannotated `def` are checked against its inferred return type,
  and a parameter with a literal default has that literal's type. Common new
  findings: `f(1.5)` against `n = 1`, `f(None)` against `name = ""`, and passing
  `deps = "//a:b"` to a wrapper declared with `deps = []`. Annotate the
  parameter to widen it.
- An existing target named like a check keeps working but makes
  `heph validate` fail until renamed.
- A plugin named `types` no longer loads: the name is reserved for
  `heph.types`.
