---
title: "Group"
sidebar_position: 6
description: Bundle targets under one address, or re-export their outputs filtered and relocated to new paths.
---

# Group

Groups multiple targets under one address. In its plain form a group is
**transparent**: it stays invisible to the build graph at run time and is
just a convenient handle for a set of targets.

Add `include`, `exclude`, `strip_prefix`, `prefix`, or `rename` and a group
does more: it re-exports its deps' outputs **filtered and relocated to new
paths**, without copying any bytes.

## Driver

A driver is the engine that interprets a target and knows how to execute it.
This plugin registers the `group` driver.

## Enabling it

Built-in; always registered by the heph engine. No configuration or plugin
registration needed — the `group` driver is automatically available to all
builds.

## Usage

```python title="BUILD"
target(
    name = "g",
    driver = "group",
    deps = ["t1", "t2"],
)
```

## Filtering and relocating outputs

Set any of `include`, `exclude`, `strip_prefix`, `prefix`, or `rename` to turn
a group into a re-export with a new path layout:

```python title="BUILD"
target(
    name = "dist",
    driver = "group",
    deps = [":lib", ":assets"],
    include = ["**/*.txt"],
    strip_prefix = "build/out",
    prefix = "release",
    rename = {"assets/notice.txt": "release/NOTICE.txt"},
)
```

| Key | Type | Meaning |
|-----|------|---------|
| `include` | `string[]` | Glob patterns an output path must match to be re-exported. Empty re-exports everything. |
| `exclude` | `string[]` | Glob patterns that drop an output path. Applied after `include`. |
| `strip_prefix` | `string` | Leading directory removed from re-exported paths. |
| `prefix` | `string` | Leading directory prepended to re-exported paths. |
| `rename` | `string` or `map[string, string]` | Where selected outputs are placed — see below. |

`include`, `exclude`, and `strip_prefix` accept the path the *producing*
target's own `BUILD` file uses (e.g. `build/out`) as well as the path heph
emits once it lands in a consumer's sandbox (e.g. `app/build/out`) — either
spelling matches the same file, so you don't need to know which layout a
dependency was built with.

Rules apply in this order: `include`/`exclude` select which outputs survive,
`rename` places the paths it names, then `strip_prefix`/`prefix` place
whatever `rename` didn't claim. Two files landing on the same destination path
is an error naming both; a pattern that matches nothing is an error naming
what was available instead of silently doing nothing.

### `rename`

`rename` has two forms:

```python title="BUILD"
# String — the sole output surviving include/exclude, renamed with no source
# path named at all. Keeps working if the dep changes where it writes.
rename = "bin/server"

# Map — exact emitted paths to destinations. Leaves everything else to
# strip_prefix/prefix.
rename = {"app/build/out/x": "lib/x"}
```

The string form only works when exactly one output survives `include`/
`exclude` — more than one is an error. It cannot be combined with
`strip_prefix`/`prefix`, since it fixes the destination outright and there
would be nothing left for a prefix to apply to. The map form can be combined
with `strip_prefix`/`prefix`: it places the paths it names, and the prefixes
place the rest.

### Cost and caching

Re-exporting costs a few string operations — no sandbox, no subprocess, and no
second copy of any byte in either the local or the remote cache. The
dependencies stay cached exactly as they were; the group itself is never
cached, since it owns none of the bytes it re-exports and is cheap to
re-derive on every build.

A group with no `include`/`exclude`/`strip_prefix`/`prefix`/`rename` stays
transparent, exactly like the plain aggregate form above.

:::note
Relative symlinks whose target stays inside the re-exported tree survive
`strip_prefix`/`prefix` (both shift every path equally), but can dangle if
`include`/`exclude`/`rename` relocates only one end of the pair.
:::

### Diagnosing the result

`heph inspect outputs <addr>` prints the paths a target actually produces.
Run it against a filtering group to see the effect of its transform, or
compare it against a dependency's own outputs to see exactly what changed:

```bash title="terminal"
heph inspect outputs //app:dist
```
