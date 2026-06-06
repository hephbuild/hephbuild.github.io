---
name: heph-target
description: Scaffold a new heph target (BUILD file entry) from a description of what it should build.
---

You are scaffolding a new heph **target** in a BUILD file. Use the `heph` skill
(`references/authoring.md`) for exact field semantics.

The user's request: $ARGUMENTS

Steps:

1. **Locate the package.** Find the BUILD file for the target's package (create
   one if absent — default file name is `BUILD`; confirm against
   `.hephconfig` `buildfile.patterns`). The package is the workspace-relative
   directory; the target address will be `//<package>:<name>`.

2. **Pick the driver.** `bash`/`sh`/`exec` for shell actions, `nix` for a pinned
   toolchain, `textfile` for a generated text file, `group` to bundle. For Go
   code, do NOT write `target()` — the `go` provider generates `:build`/`:test`
   automatically; hand the user off to the dedicated **`heph-go`** plugin
   (`/heph-go:*`) instead.

3. **Declare every input.** Translate each file/dir the command reads into
   `deps` (or `tools` for executables on `PATH`, `glob()`/`file()` for sources).
   Nothing undeclared — the sandbox won't contain it. Choose the dependency
   kind deliberately:
   - hashed + needed in sandbox → `deps`
   - must invalidate the cache but never read → `hash_deps`
   - needed only to *run* the output, not build it → `runtime_deps`

4. **Define outputs.** Use a single `out` for one artifact, or a dict for named
   output groups (`out = {"bin": ..., "doc": ...}`) so consumers can depend on
   just `//pkg:name|bin`.

5. **Wire env/tools** (`env`, `pass_env`, `tools`) and reference inputs in `run`
   via the sandbox vars (`$SRC`/`$SRC_<GROUP>`, `$LIST_SRC_*`, `$TOOL_*`,
   `$OUT`/`$OUT_<GROUP>`, `$WORKSPACE_ROOT`).

6. **Codegen?** If the output must land back in the source tree, add
   `codegen = "copy"` (new file → also run `heph tool gen-gitignore`) or
   `codegen = "in_place"` (rewrite tracked sources, keep it idempotent).

Produce the `target()` block, explain each non-obvious field in one line, then
verify with `heph inspect def //<package>:<name>` and a `heph run` (or
`heph run //<package>:<name> --shell` to poke around the sandbox first).
