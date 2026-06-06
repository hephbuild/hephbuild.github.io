---
name: heph-go-check
description: Audit a heph workspace's Go setup — provider/drivers enabled, gotool/skip sane, generated code and fixtures wired, :build/:test green.
---

You are auditing whether Go is set up correctly under heph and fixing what isn't.
Use the `heph-go` skill (`references/go-plugin.md`).

Scope (optional package/subtree or specific complaint): $ARGUMENTS

Work through the checklist; report each item as ✅ / ⚠️ / ❌ with the exact fix.

1. **Provider & drivers registered.** `.hephconfig` has `providers: [{name:
   go}]` and all three of `go_golist`, `go_embed`, `go_testmain` under `drivers:`.
   Missing any driver = generated targets can't run.

2. **Targets are actually generated.** `heph query all //...` (or the scoped
   package) lists `:build` and `:test` for each Go package. A package with none →
   check it isn't under an `options.skip` glob and that drivers are registered.

3. **Toolchain.** `options.gotool` — for reproducible/CI builds it should point at
   a pinned `nix`/`hostbin` target, not the default host Go. Flag if hermeticity
   matters and it's still the host toolchain.

4. **`skip` is intentional.** Every `options.skip` glob should correspond to a
   real non-module/vendored/externally-generated tree. Flag stray patterns that
   silently hide packages.

5. **Generated code wired with `go_src`, not `deps`.** Find codegen targets
   producing `.go`/embed assets. Each must be labelled `go_src` (and ideally
   `codegen = "copy"`). Generated code added through `deps` instead is a bug — it
   won't reach `go list`/embed resolution. For cross-package generators, confirm a
   `provider_state(provider="go", go_codegen_root=True)` at the covering root, and
   `go_codegen_deps` for any generator not labelled `go_src`.

6. **Fixtures wired with `go_test_data`.** Targets producing files a test reads at
   runtime must be labelled `go_test_data`; otherwise the test won't find them in
   the isolated sandbox.

7. **`provider_state` placement.** State is inherited by descendants and the
   deepest ancestor wins — confirm `go_codegen_root`/`go_codegen_deps`/`test.skip`
   sit at the right depth (smallest subtree that covers the need).

8. **It builds and tests.**

   ```bash
   heph run //<pkg>:build
   heph run //<pkg>:test
   heph inspect deps //<pkg>:build   # go_src / std / thirdparty edges present?
   ```

Finish with a short summary table (item → status → fix) and apply the
high-confidence fixes (missing driver registration, an unlabelled codegen target,
a fixture needing `go_test_data`). For anything ambiguous — whether a directory
*should* be skipped, where a codegen root belongs — propose the change and ask
before editing. Never convert Go code to a hand-written `target()`; the provider
owns those.
