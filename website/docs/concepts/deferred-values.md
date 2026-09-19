---
title: "Deferred values"
sidebar_position: 10
description: Reference another target's output inside a driver option, resolved once that target has run.
---

# Deferred values

A driver option's value is normally a literal you write in the BUILD file. A
**deferred value** is a reference to another target's output instead — heph
resolves it once that target has run, and the reference itself becomes the
dependency edge, so you don't also add it to `deps`.

```python title="BUILD"
target(
    name = "version",
    driver = "bash",
    deps = [file("VERSION")],
    out = "version.txt",
    run = "tr -d '\n' < $SRC > $OUT",
)

target(
    name = "image",
    driver = "bash",
    run = 'printf "%s" "myapp:${read://:version}" > $OUT',
    out = "image.txt",
)
```

`//:image` never lists `//:version` in `deps` — the reference is the edge.
Editing `VERSION` reruns `//:version`; if its output text comes out unchanged,
`//:image` stays a cache hit. If the text changed, `//:image` reruns with the
new value.

## Two forms

| Form | Resolves to |
|------|-------------|
| `${read://pkg:name}` | The contents of the target's output, with surrounding whitespace trimmed. |
| `${src://pkg:name}` | The sandbox path of the target's output file. |

Either accepts an [output-group selector](/docs/reference/addresses#output-group-selector)
for a target that publishes more than one group: `${src://tools:cli|bin}`.

A template can mix literal text with more than one reference:
`"${read://infra:registry}/app:${read://infra:version}"`.

## `${src://…}` vs. `$SRC_<group>`

[`$SRC_<group>`](/docs/plugins/exec#dependencies) already exposes a
dependency's path, but only inside a shell — expanding an environment variable
needs one. `${src://pkg:name}` fills the path in directly, so it also works as
an argument under the `exec` driver, which runs with no shell at all:

```python title="BUILD"
target(
    name = "copy-version",
    driver = "exec",
    run = ["cp", "${src://:version}", "current-version.copy"],
    out = "current-version.copy",
)
```

`${src://…}` places the producer's file into the sandbox and hashes the edge
the same way a `deps` entry does, with one difference: it does not pull in the
producer's transitive environment and tools the way `deps` does. Depend on the
target normally with `deps` instead if you need those too.

## Where you can use one

Support is per option, not per driver — an option only accepts a deferred
value if its documentation says so. Two do today: the `run` option on the
[`exec` and `bash`](/docs/plugins/exec) drivers, and the `env`/`files` values
in a [credential](/docs/concepts/credentials)'s `present` block.

A reference is always rejected in an option that decides *which targets exist*
or *what the build graph looks like* — `deps`, `tools`, `runner`, `out`,
`name`, a `glob()` pattern, an address filter, and labels. heph reports this
at parse time, before anything runs.

:::note
An unrecognized `${…}` is left exactly as written, so shell syntax that merely
looks similar — `${FOO:-default}`, `${SRC:0:3}` — still works as shell syntax.
heph only claims the form when what follows `read:` or `src:` is an
[address](/docs/reference/addresses) starting with `//` — the relative `:name`
and `./name` forms an address elsewhere accepts stay bash here too.
:::

## Failures

| When | Behavior |
|------|----------|
| the producer's build fails | the consuming target fails, naming the producer |
| the producer's output is empty | fails |
| `${read://…}` output has more than one line | fails |
| the producer publishes more than one output and no group is given | fails, listing them |
| `${src://…}` used in a [credential](/docs/concepts/credentials)'s `present` | fails at parse — a credential has no sandbox for a path to point into |

## Substitution, not quoting

heph splices the resolved value into the option's text as-is — it does not
quote it. Under the `exec` driver each reference fills exactly one argument,
so this is never a concern. Under `bash`, the value lands inside a shell
command, so a producer that emits `1.0; rm -rf /` runs exactly that:

```python title="BUILD"
run = 'printf "%s" "${read://:version}" > $OUT'   # substituted, then handed to bash
```

Only reference targets whose output you trust — including one whose cached
result was pulled from a [remote cache](/docs/concepts/caching#remote-shared-cache)
built on another machine.
