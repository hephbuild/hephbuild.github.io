---
title: "Textfile"
sidebar_position: 10
description: Generate text files from inline content, optionally marked executable.
---

# Textfile

The textfile plugin generates text files with specified content and optional
executable permissions. It takes a text string, writes it to a file at a
specified output path, and can mark the file as executable. This makes it useful
for generating configuration files, scripts, or other text-based artifacts
directly from a target definition, without reaching for an external command.

## Driver

A **driver** is the component that knows how to execute a target of a given
kind. This plugin registers the `textfile` driver.

## Enabling it

Built-in driver; automatically registered and always available. No configuration
required to enable—just use the `textfile` driver name in your targets.

## Usage

```python title="BUILD"
target(
    name = "my_script",
    driver = "textfile",
    text = """
#!/bin/bash
echo "Generated script"
""",
    out = "bin/generated.sh",
    executable = True,
)
```

## Notes

The `text` field is required. Text is automatically trimmed. The `out` field
defaults to the target name if omitted. Output path is relative to the package
root or absolute within the artifact tree.
