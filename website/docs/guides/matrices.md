---
title: "Matrices"
sidebar_position: 6
description: Declare many variants of a target — one per platform, version or flag set — from one heph.core.matrix() call.
---

# Matrices

A **matrix** is a cross product of axes. `heph.core.matrix()` calls a cell
function once per combination of axis values and returns what each call
returned. Use it to declare one target per platform, per version or per flag
set without writing each one out.

A common case is a tool released as one archive per platform, each pinned by
its own `sha256`:

```python title="tools/BUILD"
ASSETS = {
    "linux/amd64":  ("tool-x86_64-unknown-linux-gnu.tar.gz",  "<sha256>"),
    "linux/arm64":  ("tool-aarch64-unknown-linux-gnu.tar.gz", "<sha256>"),
    "darwin/arm64": ("tool-aarch64-apple-darwin.tar.gz",      "<sha256>"),
}

def _tool(platform):
    asset, sha = ASSETS[platform]
    return heph.gh.release_asset(
        name = "tool." + platform.replace("/", "-"),
        repo = "acme/tool",
        tag = "v1.2.0",
        asset = asset,
        sha256 = sha,
        extract = True,
        strip_components = 1,
    )

TOOL = heph.core.matrix(
    axes = {"platform": ["linux/amd64", "linux/arm64", "darwin/arm64"]},
    cell = _tool,
    default = {"platform": heph.core.os() + "/" + heph.core.arch()},
)
# [c.value for c in TOOL.cells] == ["//tools:tool.linux-amd64",
#                                   "//tools:tool.linux-arm64",
#                                   "//tools:tool.darwin-arm64"]
# TOOL.default == this machine's cell, e.g. "//tools:tool.darwin-arm64"

target(name = "tool", driver = "group", deps = [TOOL.default])
target(name = "tool-all", driver = "group", deps = [c.value for c in TOOL.cells])
```

`TOOL.default` is this machine's tool (`tools = [TOOL.default]`), and
`[c.value for c in TOOL.cells]` is every platform's, so a macOS laptop can
bundle the `linux/arm64` one.

The matrix itself declares nothing. A target a cell declares is an ordinary
target, exactly as if the BUILD file had written that call itself:
`:tool.linux-arm64` is cached, queried and run like any other. A cell can also
declare nothing and just compute a value, such as a URL or a command line.

A cell names its own targets. Put the cell's axis values in the name: two cells
that declare the same address with different configs are an error (see
[Duplicate declarations](#duplicate-declarations)).

## Arguments

| Argument | Meaning |
| --- | --- |
| `axes` | A dict of axis name to a list of values, in declaration order. Each name is passed to `cell` as a keyword argument; a name that is not a valid parameter name (`target-os`, `if`) reaches a `**kwargs` cell. Values can be any Starlark value and are passed through unchanged. At least one axis, at least one value per axis, no repeated values in one axis. |
| `cell` | Called once per cell, in cell order, with one keyword argument per axis. May return anything, `None` included. Omitted: each cell's value is its `axes` dict. |
| `default` | `None` (no `.default`), or a dict giving a value for every axis, naming the cell `.default` returns. |
| `exclude` | A list of dicts, each naming at least one axis: cells removed from the cross product. Each entry must match at least one cell, so a stale exclude is an error. |
| `include` | A list of dicts, each naming every axis: cells added after the cross product, in list order. A value may lie outside the axis list. An include equal to an excluded cell adds it back; one equal to a cell already present is an error. |

`exclude` and `include` follow the same rules as GitHub Actions' matrix
`exclude` and `include`. Values are compared with Starlark equality, so `1` and
`1.0` are one value and `["a", "b"]` matches `["a", "b"]`.

## The result

| Attribute | Meaning |
| --- | --- |
| `.cells` | A list with one entry per cell: the cross product (last axis varies fastest) minus `exclude`, then `include`. The order depends only on the arguments, so it is the same on every machine. |
| `cell.axes` | A dict of axis name to this cell's value, in axis declaration order. |
| `cell.value` | What `cell` returned, unchanged. Without `cell`, a dict equal to `axes`. |
| `.default` | The `value` of the cell `default` names. Without `default`, the attribute does not exist: `hasattr(M, "default")` is false. |

```python title="BUILD"
URLS = heph.core.matrix(
    axes = {"os": ["linux", "darwin"], "arch": ["amd64", "arm64"]},
    cell = lambda os, arch: "https://example.com/tool/v1.2.0/tool-%s-%s.tar.gz" % (os, arch),
    exclude = [{"os": "darwin", "arch": "amd64"}],
)
# [c.value for c in URLS.cells] == [
#     "https://example.com/tool/v1.2.0/tool-linux-amd64.tar.gz",
#     "https://example.com/tool/v1.2.0/tool-linux-arm64.tar.gz",
#     "https://example.com/tool/v1.2.0/tool-darwin-arm64.tar.gz",
# ]
# URLS.cells[2].axes == {"os": "darwin", "arch": "arm64"}
```

To look a cell up by its values, build the dict you need:

```python title="BUILD"
LINUX = {c.axes["arch"]: c.value for c in URLS.cells if c.axes["os"] == "linux"}
# LINUX == {"amd64": "https://example.com/tool/v1.2.0/tool-linux-amd64.tar.gz",
#           "arm64": "https://example.com/tool/v1.2.0/tool-linux-arm64.tar.gz"}
```

A relative address a cell returns stays relative to the package whose BUILD
file made the call. A cell that declares several targets can return a dict, and
each `.value` is that dict. The result is an ordinary value: a `.star` file can
build it at top level, and other packages can `load()` it.

There is no alias target for the default. If you want one stable name, declare
a `group` over `M.default` yourself, as `:tool` does above.

## Host-dependent defaults

:::warning
A `default` built from `heph.core.os()` and `heph.core.arch()` depends on the
host, and so does every target that uses it: its cache key moves with the
machine. On a host that has no matching cell, the `heph.core.matrix()` call
fails. Leave `default` out if the file must evaluate everywhere.
:::

Each cell's target is cached and shared across machines like any other, so
take its config from the cell's arguments, not from `heph.core.os()` or
`heph.core.arch()` read inside the cell.

## Multi-arch images

[`oci.image`](/docs/plugins/oci)'s `layers_by_platform` takes a dict of
platform to address, which you can build from the cells (`_layer` declares one
`oci.layer` target per platform and returns its address):

```python title="BUILD"
LAYER = heph.core.matrix(axes = {"platform": ["linux/amd64", "linux/arm64"]}, cell = _layer)

target(
    name = "image",
    driver = "oci.image",
    platforms = [c.axes["platform"] for c in LAYER.cells],
    layers_by_platform = {c.axes["platform"]: c.value for c in LAYER.cells},
)
```

## Duplicate declarations

Two declarations of the same address in one package with different configs
fail evaluation, whether or not they come from a matrix, in one BUILD file or
two:

```
//p:tool is declared twice with different configs: p/BUILD:3 (cell platform="linux/amd64") and
p/BUILD:3 (cell platform="linux/arm64"). They differ in config.url. If both come from a matrix cell, put the cell's
axis values in the target name; otherwise remove one declaration, or make them identical
```

Identical declarations, such as the same `.star` helper called twice, collapse
into one. Previously the first of two same-named declarations won and the
second was silently dropped.

## Errors

Every mistake fails at the call, naming the call site. A failing cell is named
by its values:

```
heph.core.matrix() at p/BUILD:4: cell os="linux", arch="amd64": Found `arch` extra named
parameter(s) for call to …
```

A `default` that names no cell lists the cells it could have named:

```
heph.core.matrix() at p/BUILD:12: default {os="darwin", arch="amd64"} names no cell of this
matrix. Its cells: {os="linux", arch="amd64"}, {os="linux", arch="arm64"},
{os="darwin", arch="arm64"}. Add it with include, or name another cell
```

To see which cell a consumer of `.default` got, run `heph inspect spec` on it.

## Limits

- At most 1,024 cells per call, counted as the cross product plus `include`,
  before any cell runs.
- A cell may not call `heph.core.matrix()`.

## What a matrix is not

- **Not a configuration.** Building a `linux/arm64` cell does not rebuild its
  deps for `linux/arm64`: each cell names its own deps.
- **Not cross-execution.** A cell whose command only runs on one platform still
  runs on the host, and fails there.
- **No implicit context.** A cell sees only its arguments. A plugin function
  called inside a cell does not learn the cell's values; pass them explicitly.
- **No address sugar.** A cell's target is a plain named target; there is no
  `//p:tool@platform=linux/arm64` form.
