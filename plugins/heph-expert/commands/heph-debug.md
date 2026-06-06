---
name: heph-debug
description: Debug a failing heph target — reproduce it in its sandbox and trace the cause.
---

You are debugging a failing heph target. Use the `heph` skill (`references/cli.md`
and `references/concepts.md`).

Target / symptom: $ARGUMENTS

Work through this, narrating findings concisely:

1. **Read the definition.** `heph inspect def <addr>` (add `--no-transitive` to
   see the direct def) and `heph inspect deps <addr>` — confirm the inputs,
   outputs, tools and sandbox config are what you expect. `heph inspect spec
   <addr>` shows the raw provider spec if the resolved def looks wrong.

2. **Reproduce in the sandbox.** `heph run <addr> --shell` (bash/sh drivers)
   drops you into the exact inputs/tools/env. Inside, inspect `$SRC_*`,
   `$TOOL_*`, `$OUT*`, `$LIST_SRC_*`, and re-run the `run` command by hand to see
   the real error.

3. **Classify the failure:**
   - *"file not found" / undeclared read* → the input isn't declared. Add it to
     `deps`/`tools` (or `glob()`/`file()`); the sandbox only contains declared
     inputs by design. Never work around this by reading from the repo.
   - *missing tool / wrong version* → add it to `tools`; for a pinned toolchain
     prefer a `nix` target or `//@heph/bin:<tool>` via hostbin.
   - *env-dependent behavior* → the var isn't in `env`/`pass_env`; add it
     (remember `pass_env` is captured at hash time).
   - *works locally, fails in CI (or vice-versa)* → almost always an undeclared
     input or ambient env leaking in; tighten declarations until the sandbox is
     self-contained.

4. **Force a clean run** with `--force` to rule out a stale cache entry, and
   `heph tool gc` if the local cache may be corrupt/oversized.

5. **Confirm the fix** by re-running and checking the summary line
   (`done / cached / failed`), then `heph inspect hashin <addr>` to see the
   stabilized cache key.

If the target is a codegen target, also see `/heph-ci` for the `--frozen` check.
