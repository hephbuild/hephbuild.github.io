---
name: heph-ci
description: Set up or review heph in CI — frozen codegen checks, graph validation, and a warm cache.
---

You are setting up (or reviewing) heph in CI. Use the `heph` skill
(`references/cli.md` and `references/concepts.md` → *Codegen* / *Reproducibility*).

Context / CI system: $ARGUMENTS

A good heph CI run rests on three guarantees, plus cache reuse:

1. **The graph links and codegen outputs don't conflict.**
   ```bash
   heph validate            # whole workspace (or a PACKAGE_MATCHER)
   ```
   Fails on broken edges and on two `copy` targets claiming overlapping/contained
   output paths.

2. **Generated code is committed and current** — assert it without mutating the
   tree:
   ```bash
   heph run <codegen-target> --frozen
   ```
   `--frozen` computes the output but writes nothing, comparing against disk and
   exiting non-zero with a unified diff if they differ. Run it for every codegen
   target (or via a label, e.g. `heph run codegen //... --frozen`). This catches
   anyone who forgot to run codegen locally, for both `copy` and `in_place`.

3. **`.gitignore` for `copy` outputs is in sync.** Either run
   `heph tool gen-gitignore` and fail if it produces a diff, or rely on the
   `--frozen` codegen check above to cover the generated files themselves.

4. **The actual build/tests**, reusing cache:
   ```bash
   heph run build //...                 # or your build label
   heph run test //... -e //vendor/...  # run everything labelled "test"
   ```

**Warm cache.** Pin `version:` in `.hephconfig` so every CI job resolves the
same toolchain byte-for-byte. Persist/restore heph's cache directory between
runs (its home/cache location follows `homeDir`; the local cache lives under
`.heph3/cache`) using your CI's cache action keyed on the lockfiles/inputs.
Enable remote cache on targets (`cache = {remote: True}`) where the runners can
share a backend, so a cold runner still gets hits. Note the `nix` driver
disables remote caching (host-local `/nix/store` paths).

Deliver: the concrete CI steps in the user's CI syntax (or a generic shell
script), in the order validate → frozen codegen → build/test, with the cache
save/restore wrapping the build. Keep each step a single `heph` invocation where
possible, and explain what each guard catches.
