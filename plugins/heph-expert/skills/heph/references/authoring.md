# Authoring heph BUILD files

How to write and edit BUILD files. BUILD files are **Starlark** (a small,
deterministic Python dialect) discovered by the `buildfile` provider. Sources:
`https://hephbuild.github.io/docs/plugins/buildfile.md` and
`.../plugins/exec.md`.

## Contents
- [Builtins](#builtins)
- [`target()`: engine fields vs driver fields](#target-engine-fields-vs-driver-fields)
- [`file()` and `glob()`](#file-and-glob)
- [`heph.core`: host platform](#hephcore-host-platform)
  - [`heph.core.matrix`: one declaration, many variants](#hephcorematrix-one-declaration-many-variants)
- [`load()`: sharing symbols](#load-sharing-symbols)
- [Exec driver fields](#exec-driver-fields)
- [Dependency kinds](#dependency-kinds)
- [Output groups](#output-groups)
- [Sandbox environment variables](#sandbox-environment-variables)
- [Codegen on a target](#codegen-on-a-target)

---

## Builtins

The buildfile plugin exposes a fixed set of Starlark builtins:

| Builtin | Returns | Purpose |
|---|---|---|
| `target(name, driver, **kwargs)` | the target's address | Declare a target. |
| `file(path, abs=False)` | a file address | Reference one workspace file as input. |
| `glob(pattern, exclude=None, abs=False)` | a glob address | Reference many files by pattern. |
| `struct(**kwargs)` | a struct | Bundle named values to pass into a field. |
| `get_pkg()` | current package path | Legacy; prefer `heph.core.pkg()`. |
| `provider_state(provider, **kwargs)` | — | Hand package-level state to a provider. |
| `heph.core` | namespace | Host platform info + current package. |

f-strings work in BUILD files and in `load()`ed `.star` files:
`target(name = f"tool-{version}", deps = [f"//tools:{tool}"])`. Any expression
goes inside the braces (`f"{xs[0]}_{len(xs)}"`); `{{` / `}}` are literal braces.

## `target()`: engine fields vs driver fields

`target()` returns the new target's address, so you can bind it to a variable
and reference it elsewhere instead of retyping the address.

Only these fields are interpreted by the engine/buildfile:

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Target name within its package. |
| `driver` | no* | Driver that executes it (`bash`, `exec`, `nix`, `group`, …). Required when `defaultDriver` is not set in the buildfile provider options. |
| `labels` | no | Label or list of labels, used by `query` and matchers. Each must match `[A-Za-z0-9_-]+` — a label outside that grammar fails the `target()` call. |
| `transitive` | no | Sandbox settings propagated to dependents. |

**Everything else** (`run`, `deps`, `out`, `env`, `cache`, `codegen`, …) is
**driver-defined**: buildfile forwards it verbatim to the named driver. For the
exec drivers (`bash`/`exec`) those fields are documented below.

```python title="BUILD"
lib = target(name = "lib", driver = "bash", run = "go build -o $OUT .", out = "lib")

target(
    name = "image",
    driver = "bash",
    deps = {"bin": lib},          # reference the handle returned above
    run = "cp $SRC_BIN $OUT",
    out = "image",
)
```

## `file()` and `glob()`

Both resolve to filesystem (`//@heph/fs:…`) addresses, so their results drop
straight into a dependency field. Paths are relative to the BUILD file's
package by default; pass `abs=True` to resolve from the workspace root.

For `glob()`, `exclude` resolves exactly like `pattern` — package-relative by
default, workspace-root-relative under `abs=True`. A package-relative
`exclude=["vendor/**"]` in `//pkg` excludes `pkg/vendor/**`, not a root-level
`vendor/**`; add `abs=True` to exclude from the workspace root instead.

```python title="BUILD"
target(
    name = "lib",
    driver = "bash",
    deps = [glob("src/**/*.go", exclude = "src/**/*_test.go")],
    run = "go build -o $OUT ./src",
    out = "lib",
)
```

## `heph.fs`: path helpers

Available in every BUILD file. These return plain string values (not target
addresses) and are useful for computing paths at BUILD-eval time.

| Function | Signature | Returns |
|---|---|---|
| `heph.fs.glob(pattern)` | `glob(pattern: string) -> list[string]` | Paths matching `pattern`, relative to the current package. |
| `heph.fs.join(*elems)` | `join(*elems: string) -> string` | Join path elements (`path.Join` semantics). |
| `heph.fs.dir(path)` | `dir(path: string) -> string` | Directory component of `path`. |
| `heph.fs.base(path)` | `base(path: string) -> string` | Base name of `path`. |
| `heph.fs.parent(filename)` | `parent(filename: string) -> string \| None` | Workspace-root-relative path of the closest `filename`, searching the current package's directory then each ancestor up to the workspace root. `None` if no ancestor has it. Bare file name only — `/` in `filename` is an error. |

All five enforce their argument types. Wrong type, missing required arg, or
unknown keyword → hard error naming the function and the offending argument.

Note: `heph.fs.glob(pattern)` returns a `list[string]` of path strings; the
top-level `glob(pattern)` builtin returns a filesystem _target address_. Use
`heph.fs.glob` when you need path strings, `glob()` for build inputs.

## `heph.core`: host platform

Available in every BUILD file; use it to vary targets by OS/arch.

| Function | Returns | Example |
|---|---|---|
| `heph.core.os()` | normalized OS | `darwin`, `linux`, `windows` |
| `heph.core.arch()` | normalized arch | `amd64`, `arm64` |
| `heph.core.os_raw()` | host OS identifier | `macos`, `linux` |
| `heph.core.arch_raw()` | host arch identifier | `x86_64`, `aarch64` |
| `heph.core.pkg()` | current package path | `tools/build` |
| `heph.core.num_cpu()` | CPUs available to the process (>=1) | `8` |
| `heph.core.packages(matcher)` | sorted matching workspace package paths | `["tools", "tools/build"]` |

Normalized names match container-registry / distribution conventions; use the
`*_raw()` forms when a tool or URL expects the host's exact identifiers.

`heph.core.packages(matcher)` takes a query matcher string (`//foo`,
`//foo/...`, combined with `&&`/`||`/`!`; relative forms resolve against the
current package) and is evaluated per package — only package-level matchers
work, a target-level one (`label(...)`, `//pkg:name`) errors instead of
matching nothing.

```python title="BUILD"
target(
    name = "tool",
    driver = "exec",
    run = ["curl -fsSLo $OUT https://releases.example.com/tool/{}/{}/tool".format(
        heph.core.os(), heph.core.arch())],
    out = "tool",
)
```

You can branch on platform with normal Starlark `if`.

### `heph.core.matrix`: one declaration, many variants

`heph.core.matrix(axes, cell=None, default=None, exclude=None, include=None)`
calls `cell` once per combination of axis values (keyword args, one per axis)
and returns `.cells` (each with `.axes` and `.value` = what `cell` returned)
plus `.default` (the value of the cell `default` names; absent without
`default`). The matrix declares nothing itself: targets a cell declares are
ordinary targets. Cell order is the cross product (last axis fastest) minus
`exclude`, then `include` (GitHub Actions rules).

```python title="BUILD"
ASSETS = {
    "linux/amd64":  ("tool-x86_64-unknown-linux-gnu.tar.gz",  "<sha256>"),
    "linux/arm64":  ("tool-aarch64-unknown-linux-gnu.tar.gz", "<sha256>"),
    "darwin/arm64": ("tool-aarch64-apple-darwin.tar.gz",      "<sha256>"),
}

def _tool(platform):
    asset, sha = ASSETS[platform]
    return heph.gh.release_asset(
        name = "tool." + platform.replace("/", "-"),  # axis value in the name
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
```

`TOOL.default` is this host's tool (`tools = [TOOL.default]`);
`[c.value for c in TOOL.cells]` is every platform's (`//p:tool.linux-amd64`, …).

- Axis values are any Starlark value; a non-identifier axis name reaches a
  `**kwargs` cell. `exclude` entries must match a cell (stale = error);
  `include` entries name every axis; an include duplicating a present cell is
  an error.
- `default = {"platform": heph.core.os() + "/" + heph.core.arch()}` makes
  `.default` host-dependent (consumers' cache keys move with the host) and
  fails evaluation on a host with no cell. Inside a cell, take config from the
  cell's arguments, not `heph.core.os()`/`arch()`.
- Limits: at most 1,024 cells per call; a cell may not call `heph.core.matrix()`.
- Not a configuration (deps aren't rebuilt per cell), not cross-execution, no
  implicit context for plugin functions, no `@axis=value` address sugar.
- Same address declared twice in one package with different configs is an
  error (matrix or not); identical declarations collapse into one.

## `load()`: sharing symbols

`load()` imports symbols from another Starlark file so common definitions live
in one place. A loaded helper registers its targets against the package that
*calls* it, not the file it is defined in:

```python title="BUILD"
load("//build/defs:go.star", "go_service")
go_service(name = "api")
```

## Exec driver fields

The `exec` plugin registers two drivers: `exec` (direct execution), `bash`
(bash with job control, `-o pipefail`). `bash` supports interactive
`--shell` mode with PTY allocation. Target config keys:

| Key | Meaning |
|---|---|
| `run` | Command(s) to execute (string or list). |
| `deps` | Hashed build-time dependencies (present in sandbox). |
| `hash_deps` | Hash-only dependencies (invalidate cache, NOT in sandbox). |
| `runtime_deps` | Runtime-only deps (in sandbox at run, NOT hashed). |
| `tools` | Executables placed on `PATH`. |
| `out` | Output groups and paths. |
| `support_files` | Non-output artifacts kept in the sandbox for the command's own use, not published to dependents. |
| `env` | Literal env vars (hashed). |
| `pass_env` | Pass-through vars from the parent, captured at **hash** time. |
| `runtime_pass_env` | Pass-through vars at runtime only. |
| `runtime_env` | Literal runtime-only env vars. |
| `cache` | Bool, or `{enabled, remote, history}`. |
| `codegen` | `"copy"`, `"in_place"` or `"in_place_on_success"` — write outputs into the source tree. |
| `failure_out` | Files to keep in the failure slot when the run fails; same shape as `out`, never hashed. See `concepts.md` → *Failed targets*. |
| `runner` | Exec runner this command runs under: a target address producing a `runner.json`, or `"local"` to opt out of a workspace-wide default (the driver's own `runner:` option). See `concepts.md` → *Runners*. |

```python title="BUILD"
target(
    name = "hello",
    driver = "bash",
    run = "echo hello world > $OUT",
    out = "greeting.txt",
    env = {"MY_VAR": "value"},
    pass_env = ["HOME", "USER"],
    deps = {"src": "//src:files"},
    tools = "//toolchain:gcc",
    cache = {"enabled": True, "remote": True, "history": 5},
)
```

## Dependency kinds

The three kinds differ ONLY by how they touch the cache and sandbox — this is
the most common "why did/didn't it rebuild" gotcha:

| Field | Hashed into key? | In sandbox? | Use for |
|---|---|---|---|
| `deps` | yes | yes | Normal build inputs. |
| `hash_deps` | yes | no | Inputs that must invalidate the cache but the command never reads. |
| `runtime_deps` | no | yes (run only) | Things needed to *run* an output, not build it — changing them is still a cache hit. |

`deps` (and `out`) accept either a **list** (lands in the default group, exposed
as `$SRC` / `$OUT`) or a **dict** (named groups, exposed as `$SRC_<GROUP>` /
`$OUT_<GROUP>`). `$LIST_SRC` / `$LIST_SRC_<GROUP>` is a file listing every path
in the group — handy when a group expands to many files.

Group names are uppercased and sanitized into a valid env var name: any
character outside `A-Z`, `0-9`, `_` becomes `_` (`my-group` → `$SRC_MY_GROUP`).
Same rule for `tools` and `out` group names.

```python title="BUILD"
target(
    name = "bundle",
    driver = "bash",
    deps = {"code": glob("*.go"), "assets": "//web:assets"},
    run = "cat $LIST_SRC_CODE; cp -r $SRC_ASSETS $OUT",
    out = "bundle",
)
```

## Output groups

`out` mirrors `deps`. A string/list is the default group (`$OUT`); a dict names
groups (`$OUT_<group>`). Dependents select a group with the `|group` selector:

```python title="BUILD"
target(
    name = "compile",
    driver = "bash",
    run = "go build -o $OUT_BIN .; go doc . > $OUT_DOC",
    out = {"bin": "app", "doc": "app.txt"},
)

target(
    name = "package",
    driver = "bash",
    deps = ["//app:compile|bin"],   # only the bin group
    run = "cp $SRC $OUT",
    out = "app.tar",
)
```

### Symlinks in outputs

Checked when outputs are collected from the sandbox, for every sandboxed driver
(`exec`/`bash`, Go, OCI, …); breaking either rule fails the target:

- **Globs and declared paths never go through a symlinked directory.**
  `out = "out/**/*.js"` fails if `out/vendor` is a link to a directory; so do
  `out = "out/vendor/x.js"` and `out = "out/vendor/lib/"`. The error ends in
  `heph does not follow it`. Fix: output the real directory, or copy instead of
  linking. Links heph itself makes for a target's deps are followed; a mounted
  scratch directory is not.
- **A packed symlink must be relative and point to a file or directory in the
  same output group.** Absolute links, links climbing out (`../../x`), links to
  files not output, and links into another output group all fail the pack.
- A glob that only *matches* a link (last component) outputs the link itself,
  held to the second rule: `out = ["out/*", "out/real/*"]` with
  `out/current -> real` is fine.
- Cache entries made before these rules are still served on a hit; a fresh
  build of the same target fails.

## Sandbox environment variables

Available inside an exec sandbox:

| Variable | Meaning |
|---|---|
| `SRC` / `SRC_<group>` | Dependency paths. |
| `LIST_SRC` / `LIST_SRC_<group>` | File listing each dependency path. |
| `TOOL` / `TOOL_<group>` | Tool paths. |
| `TOOL_ROOT` / `TOOL_<group>_ROOT` | Each tool's package directory as staged, holding its outputs and `support_files` at their declared paths (`$TOOL_ROOT/sdk/include`). One entry per tool package, sorted, space-separated; unset when no tool comes from a package (source file, host binary). Absolute — strip with `-ffile-prefix-map`/`-trimpath` if it can reach an output. Refused at parse if it collides with another group's `TOOL_<group>` (`{"": …, "root": …}`) or with a name in `env`/`runtime_env`/`pass_env`/`runtime_pass_env`/transitive env. |
| `HEPH_TOOLS_DIR` | Directory every tool is staged under; a tool's outputs and `support_files` sit at `<package>/<path>` below it (package without `//`), whatever group lists it and whatever else that group holds. Lets a launcher script find files shipped beside it, e.g. `cat "$HEPH_TOOLS_DIR/greetcli/lib/data.txt"`. Set only for a target with tools; unset when none staged a file. Setting it yourself on such a target is refused at parse; a `"*"` passthrough never carries the host's value. Absolute, not hashed. |
| `OUT` / `OUT_<group>` | Output paths. |
| `WORKSPACE_ROOT` | Root of the workspace. |
| `PATH` | Executables search path. |

## Codegen on a target

Set `codegen = "copy"` (new generated file, gitignored) or
`codegen = "in_place"` (rewrite a tracked source). See `concepts.md` →
*Codegen* for the full rules, `heph tool codegen gitignore`, conflict detection via
`heph validate`, and CI verification via `--frozen`.
