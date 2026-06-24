---
title: "Validating your workspace"
sidebar_position: 3
description: Use heph validate to catch broken targets, overlapping codegen outputs, and a stale .gitignore before they reach CI.
---

# Validating your workspace

`heph validate` checks your workspace without running any builds. It resolves every target's inputs, detects overlapping codegen outputs, and verifies that `.gitignore` is current. All three checks run in parallel and every failure is reported at once — not just the first one — so you can fix everything in a single pass.

## What it checks

| Check | What it catches |
|-------|-----------------|
| **Target link** | Every in-scope target is parsed and its runtime inputs are resolved. A missing dependency or an unresolvable target surfaces here. No execution happens. |
| **Codegen overlap** | Two `codegen = copy` targets that write to the same output path. |
| **`.gitignore` freshness** | The `.gitignore` block maintained by heph is out of date. If stale, the error message tells you to run `heph tool gen-gitignore`. Skipped when a package matcher is provided. |

## Usage

```bash title="terminal"
heph validate              # whole workspace
heph validate //pkg/...    # scope to a package matcher
```

When a package matcher is provided, the `.gitignore` freshness check is skipped (it applies to the whole workspace), and a warning is printed to say so. The target link and overlap checks still run.

If any check fails, `heph validate` exits non-zero and lists every problem it found.

## In CI

`heph validate` is a natural CI gate: it is read-only, exits non-zero on any problem, and surfaces all failures in one run.

```bash title="terminal"
heph validate --no-tui
```

Use `--no-tui` to force plain log output in headless environments. See [Using heph in CI](/docs/guides/ci) for a representative CI job.
