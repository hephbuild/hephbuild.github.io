---
name: heph-go-setup
description: Enable and configure the heph go provider (provider + go_golist/go_embed/go_testmain drivers, gotool, skip) in a workspace.
---

You are turning on Go support in a heph workspace. Use the `heph-go` skill
(`references/go-plugin.md`) for exact option semantics.

The user's request / context: $ARGUMENTS

Steps:

1. **Find the workspace.** Locate `.hephconfig` at the workspace root (the
   directory above the Go packages). If there's no `.hephconfig`, this isn't a
   heph workspace yet — say so before proceeding.

2. **Confirm Go is present.** Check for `go.mod` and `.go` sources. Note the
   module path and any subtrees that shouldn't be scanned (vendored code,
   externally-managed generated stubs).

3. **Register the provider and drivers.** Add to `.hephconfig`:

   ```yaml title=".hephconfig"
   providers:
     - name: go
       options:
         gotool: "//@heph/bin:go"   # or a pinned nix/hostbin toolchain target
         skip: []                    # workspace-relative globs to exclude
   drivers:
     - name: go_golist
     - name: go_embed
     - name: go_testmain
   ```

   All three drivers are mandatory — generated targets won't run without them.

4. **Decide `gotool`.** Default `//@heph/bin:go` wraps the host Go. For
   reproducible CI, recommend pointing it at a pinned toolchain target (`nix` or
   `hostbin`) and create/reference that target.

5. **Decide `skip`.** Add workspace-relative globs for any directory that should
   not be discovered as Go packages (e.g. `vendor`, `internal/generated/**`).

6. **Verify.** Run:

   ```bash
   heph query all //...        # the go provider should now generate :build/:test
   heph run //<some-pkg>:build
   heph run //<some-pkg>:test
   ```

   If a package produces no targets, check it isn't under a `skip` glob and that
   all three drivers are registered.

Show the exact `.hephconfig` diff, explain any non-default `gotool`/`skip` choice
in one line each, and finish with the verification commands. Do **not** write
`target()` for Go code — the provider generates it. If the user needs generated
code or fixtures wired in, point them at `/heph-go:heph-go-codegen`.
