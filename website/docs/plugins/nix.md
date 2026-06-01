---
title: "Nix"
sidebar_position: 8
description: Builds reproducible shell environments with Nix and exposes their programs as tool binaries.
---

# Nix

The Nix plugin builds reproducible shell environments using Nix, resolving
packages from a nixpkgs flake URL and exposing selected programs as tool
binaries. The driver locks flake URLs to ensure pure evaluation, builds an
environment via `nix build`, and wraps the resulting programs for use in other
build targets. This lets you pin an exact toolchain once and depend on it from
anywhere in the graph without polluting the host environment.

## Driver

A **driver** is the component that knows how to execute a target's action,
turning a resolved target into runnable work. This plugin registers the `nix`
driver.

## Enabling it

Built-in and automatically registered. Enable the `nix` driver by referencing
it in a target's `driver` field. Requires the `nix` command-line tool with
flakes support on the host `PATH`.

## Configuration

```yaml
nix_tools = target(
    driver = "nix",
    nixpkgs = "github:NixOS/nixpkgs/nixos-unstable",  # flake URL, required
    packages = ["pkgs.ripgrep", "pkgs.fd"],           # list of pkg expressions, required
    programs = ["rg", "fd"],                          # list of binary names to expose, required
    system = "x86_64-linux",                          # optional; defaults to host arch/os
)
```

## Usage

Build a small toolchain and consume it from another target via `tools`:

```python title="BUILD"
nix_tools = target(
    name = "nix_tools",
    driver = "nix",
    nixpkgs = "github:NixOS/nixpkgs/nixos-unstable",
    packages = ["pkgs.ripgrep"],
    programs = ["rg"],
)

target(
    name = "check",
    driver = "bash",
    tools = nix_tools,
    run = ["rg --version"],
)
```

## Notes

Requires `nix` on `PATH` with the `nix-command` and `flakes` experimental
features. The `nixpkgs` URL should pin a specific commit for reproducibility
(moving branches are resolved once then cached until the URL changes). Programs
must exist at `{store_path}/bin/{program}` after the nix build. Remote caching
is disabled because wrappers reference host-local `/nix/store` paths. Use
`system` to override the default host system detection (e.g. for
cross-compilation specs).
