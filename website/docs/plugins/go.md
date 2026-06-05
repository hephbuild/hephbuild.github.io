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

The provider will generate appropriate `:build` and `:test` targets for Go
packages. You can explore the generated targets with `heph query all .`. 
