---
title: "Template"
sidebar_position: 11
description: Render a template file with declared variables into a cacheable output, without a shell.
---

# Template

The template plugin renders a template file with variables you declare and
writes the result to an output file. Use it to fill in a config file instead of
reaching for `sed` or `envsubst` in a shell command.

## Driver

A **driver** is the component that knows how to execute a target of a given
kind. This plugin registers the `template` driver.

## Enabling it

Built-in driver; automatically registered and always available. Use the
`template` driver name in your targets.

## Usage

```python title="BUILD"
target(
    name = "conf",
    driver = "template",
    src = glob("app.conf.j2"),
    out = "app.conf",
    vars = {"host": "0.0.0.0", "port": "8080", "tls": "on"},
)
```

```jinja title="app.conf.j2"
listen {{ host }}:{{ port }}
tls {{ tls }}
```

## Options

| Field        | Required | Description                                                              |
|--------------|----------|--------------------------------------------------------------------------|
| `src`        | yes      | The template file. Must produce exactly one file.                        |
| `out`        | no       | Output file name. Defaults to the target name.                           |
| `vars`       | no       | Map of variable names to string values the template can reference.       |
| `executable` | no       | Mark the rendered file executable.                                       |

Editing the template or changing `vars` rebuilds the output and everything
downstream of it.

## Undefined variables

A template that uses a variable `vars` does not supply fails, and the error
names the missing variables:

```
template //pkg:conf: template uses variables that `vars` does not supply:
prot, tls. Supplied: features, host, port
```

## Isolation

A template can only use what you declare. `{% include %}` and `{% import %}`
fail rather than reading other files.

## Values from another target

A `vars` value may contain `${read://pkg:name}`, which is replaced with the
contents of that target's single output:

```python title="BUILD"
target(
    name = "deploy",
    driver = "template",
    src = file("deploy.yaml.j2"),
    out = "deploy.yaml",
    vars = {"image": "${read://infra:registry}/app:${read://app:version}"},
)
```

The referenced targets are built before the template renders, and their content
is part of the cache key.

:::note
`${src://…}` is not allowed in `vars`. Use `${read://…}` to get a target's
contents.
:::
