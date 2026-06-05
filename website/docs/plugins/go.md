---
title: "Go"
sidebar_position: 5
description: Go language support — analyze packages and generate library, binary, and test targets.
---

# Go

Provides Go language support for heph. The `go` provider analyzes Go packages
and generates targets for building libraries, binaries, and tests. It reads
package metadata, resolves source files and module dependencies, and wires up
the targets needed to compile and run Go code. Three managed drivers do the
underlying work: package metadata analysis (`go_golist`), Go embed processing
(`go_embed`), and test main generation (`go_testmain`).

## Driver

A driver is the execution backend that knows how to run a particular kind of
target. This plugin registers three drivers: `go_golist`, `go_embed`, and
`go_testmain`. These are mostly internal, you should not be interracting with
them directly.

## Enabling it

Registered as an opt-in provider factory named `go` in `.hephconfig`. The three
drivers (`go_golist`, `go_embed`, `go_testmain`) are registered as managed
driver factories and must be enabled in the `drivers` section of
`.hephconfig`.

## Configuration

```yaml title=".hephconfig"
providers:
  - name: go
    options:
      gotool: "//@heph/bin:go"  # Path to Go binary (optional, defaults to //@heph/bin:go)

drivers:
  - name: go_golist
  - name: go_embed
  - name: go_testmain
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gotool` | `string` | `"//@heph/bin:go"` | Address of the Go binary target to use. |
| `skip` | `string[]` | `[]` | Workspace-relative glob patterns for directories to exclude from Go package discovery. |

### Skipping directories

Use `skip` to prevent the provider from scanning directories you don't want
included in Go package discovery — for example, directories containing
non-module code, generated stubs, or vendored packages managed outside of heph.
Each pattern is matched against the workspace-relative path of the directory.

```yaml title=".hephconfig"
providers:
  - name: go
    options:
      skip:
        - vendor
        - "internal/generated/**"
```

## Usage

The provider analyzes each Go package from its `go.mod` and source files and
generates targets for it — you don't write `target()` calls for Go code. For a
package it produces:

| Target    | Builds | Labels |
|-----------|--------|--------|
| `:build`  | The library or, for `package main`, the binary. | |
| `:test`   | The package's tests. | `test`, `go-test` |

Explore what was generated for the package in the current directory:

```bash title="terminal"
heph query all .
```

Then build or test by address:

```bash title="terminal"
heph run //cmd/server:build     # compile the binary
heph run //lib/auth:test        # run the package's tests
```

### Generated dependency addresses

The provider wires each package's imports automatically through two address
families it generates — you reference these only when reading a dependency
graph, never by hand:

| Address | Resolves to |
|---------|-------------|
| `@heph/go/std/<pkg>` | A package from the Go standard library. |
| `@heph/go/thirdparty/<module>@<version>` | A pinned third-party module. |

Because the module and version are part of the address, a dependency bump
changes the address and invalidates only the targets that import it.
