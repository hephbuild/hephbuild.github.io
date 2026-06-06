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

## `target()`: engine fields vs driver fields

`target()` returns the new target's address, so you can bind it to a variable
and reference it elsewhere instead of retyping the address.

Only these fields are interpreted by the engine/buildfile:

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Target name within its package. |
| `driver` | yes | Driver that executes it (`bash`, `sh`, `exec`, `nix`, `group`, …). |
| `labels` | no | Label or list of labels, used by `query` and matchers. |
| `transitive` | no | Sandbox settings propagated to dependents. |

**Everything else** (`run`, `deps`, `out`, `env`, `cache`, `codegen`, …) is
**driver-defined**: buildfile forwards it verbatim to the named driver. For the
exec drivers (`bash`/`sh`/`exec`) those fields are documented below.

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

```python title="BUILD"
target(
    name = "lib",
    driver = "bash",
    deps = [glob("src/**/*.go", exclude = "src/**/*_test.go")],
    run = "go build -o $OUT ./src",
    out = "lib",
)
```

## `heph.core`: host platform

Available in every BUILD file; use it to vary targets by OS/arch.

| Function | Returns | Example |
|---|---|---|
| `heph.core.os()` | normalized OS | `darwin`, `linux`, `windows` |
| `heph.core.arch()` | normalized arch | `amd64`, `arm64` |
| `heph.core.os_raw()` | host OS identifier | `macos`, `linux` |
| `heph.core.arch_raw()` | host arch identifier | `x86_64`, `aarch64` |
| `heph.core.pkg()` | current package path | `//tools/build` |

Normalized names match container-registry / distribution conventions; use the
`*_raw()` forms when a tool or URL expects the host's exact identifiers.

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

## `load()`: sharing symbols

`load()` imports symbols from another Starlark file so common definitions live
in one place. A loaded helper registers its targets against the package that
*calls* it, not the file it is defined in:

```python title="BUILD"
load("//build/defs:go.star", "go_service")
go_service(name = "api")
```

## Exec driver fields

The `exec` plugin registers three drivers: `exec` (direct execution), `bash`
(bash with job control), `sh` (POSIX shell). `bash`/`sh` support interactive
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
| `codegen` | `"copy"` or `"in_place"` — write outputs into the source tree. |

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

## Sandbox environment variables

Available inside an exec sandbox:

| Variable | Meaning |
|---|---|
| `SRC` / `SRC_<group>` | Dependency paths. |
| `LIST_SRC` / `LIST_SRC_<group>` | File listing each dependency path. |
| `TOOL` / `TOOL_<group>` | Tool paths. |
| `OUT` / `OUT_<group>` | Output paths. |
| `WORKSPACE_ROOT` | Root of the workspace. |
| `PATH` | Executables search path. |

## Codegen on a target

Set `codegen = "copy"` (new generated file, gitignored) or
`codegen = "in_place"` (rewrite a tracked source). See `concepts.md` →
*Codegen* for the full rules, `heph tool gen-gitignore`, conflict detection via
`heph validate`, and CI verification via `--frozen`.
