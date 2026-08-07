---
title: Plugins
sidebar_position: 1
description: The plugins that supply heph's functionality — the drivers targets execute through, the providers that discover them, and the hooks that observe build events.
slug: /plugins
---

# Plugins

Almost everything heph can do comes from **plugins**. Plugins come in three
kinds: a **driver** is a named executor a target references via its `driver`
field; a **provider** discovers or generates targets; a **hook** observes the
engine's build-event stream without producing or running anything. For example,
when you write `driver = "bash"` in a BUILD file, you are reaching for a driver
registered by the [Exec](./exec.md) plugin; when heph scans the workspace for
BUILD files, that is a provider at work.

## Drivers

Each driver plugin registers one or more named executors a target can run
through.

| Plugin                  | Driver                                   | Purpose                                                              |
|-------------------------|------------------------------------------|----------------------------------------------------------------------|
| [Exec](./exec.md)       | `exec`, `bash`, `sh`                     | Runs shell commands in sandboxed builds, with interactive debugging. |
| [Filesystem](./fs.md)   | `fs`                                     | References workspace files and globs as build inputs.                |
| [Group](./group.md)     | `group`                                  | Bundles targets transparently with no extra work.                    |
| [Hostbin](./hostbin.md) | `hostbin`                                | Wraps host `PATH` binaries as targets for the build system.          |
| [HTTP Fetch](./http-fetch.md) | `http_fetch`                       | Downloads a URL, templated over the target's address args, into a cacheable file output. |
| [Nix](./nix.md)         | `nix`                                    | Builds reproducible tool environments via Nix flakes.                |
| [Textfile](./textfile.md) | `textfile`                             | Generates text files with optional executable permissions.           |

## Languages

Language plugins add first-class support for a toolchain, registering the
drivers that build its libraries, binaries, and tests.

| Plugin        | Driver                                   | Purpose                                        |
|---------------|------------------------------------------|------------------------------------------------|
| [Go](./go.md) | `go_golist`, `go_embed`, `go_testmain`   | Go language support: libraries, binaries, tests. |

## Containers

The OCI plugin builds and moves container images, with or without a
Dockerfile and with or without a daemon.

| Plugin        | Driver                                                                                        | Purpose                                        |
|---------------|-------------------------------------------------------------------------------------------------|------------------------------------------------|
| [OCI](./oci.md) | `docker_build`, `oci_image`, `oci_layer`, `oci_index`, `oci_pull`, `oci_push`, `oci_load` | Build an image (with a Dockerfile or from target outputs), group multi-platform images, and move images between a registry, the cache, and a local docker daemon. |

## Providers

Each provider plugin discovers or generates targets rather than executing them,
so it registers no driver.

| Plugin                      | Purpose                                                          |
|-----------------------------|--------------------------------------------------------------|
| [Buildfile](./buildfile.md) | Scans the workspace for BUILD files and parses target definitions. |
| [Query](./query.md)         | Selects targets dynamically by label, package, prefix, or output.  |

## Hooks

Hook plugins observe the engine's `BuildEvent` stream — targets matched,
started, finished, cache hits, failures — without producing or running targets.
They are purely build-event consumers and run in the same process as heph on a
background thread.

| Plugin                              | Purpose                                                                    |
|--------------------------------------|-----------------------------------------------------------------------|
| [GitHub Actions](./gha.md)          | Live PR comment and step summary for GitHub Actions builds.                |
