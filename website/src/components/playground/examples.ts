/**
 * The example workspaces copied into the VM under /root/examples. Each one is a
 * self-contained heph workspace: a `.hephconfig`, BUILD files and a README the
 * visitor can `cat`. Everything runs offline — the VM has no internet.
 */

export interface Example {
  dir: string;
  title: string;
  /** Command to try first; shown in the UI and in the README. */
  try: string;
  readme: string;
  files: Record<string, string>;
}

const BASE_PLUGINS = `plugins:
  - builtin: buildfile
  - builtin: bash
  - builtin: exec
`;

export const EXAMPLES: Example[] = [
  {
    dir: 'hello',
    title: 'A first build',
    try: 'heph run //:shout --cat-out',
    readme: `Two targets: \`greeting\` writes a file, \`shout\` depends on it.

  heph run //:shout --cat-out   # builds both, prints HELLO WORLD
  heph run //:shout             # again: both are cache hits

Edit the \`run\` of greeting in BUILD and run it again — only what changed rebuilds.`,
    files: {
      BUILD: `greeting = target(
    name = "greeting",
    driver = "bash",
    run = "echo 'hello world' > $OUT",
    out = "greeting.txt",
)

target(
    name = "shout",
    driver = "bash",
    deps = {"msg": greeting},
    run = "tr a-z A-Z < $SRC_MSG > $OUT",
    out = "shout.txt",
)
`,
    },
  },
  {
    dir: 'sources',
    title: 'Source files as inputs',
    try: 'heph run //:stats --cat-out',
    readme: `\`stats\` reads every file under docs/ through a glob.

  heph run //:stats --cat-out
  echo "one more line" >> docs/b.txt
  heph run //:stats --cat-out   # the input changed, so it rebuilds

Touching a file without changing its content is still a cache hit.`,
    files: {
      'docs/a.txt': 'heph caches every target by the hash of its inputs.\n',
      'docs/b.txt': 'Change an input and only its dependents rebuild.\n',
      'docs/c.txt': 'Everything else comes straight from the cache.\n',
      BUILD: `target(
    name = "stats",
    driver = "bash",
    deps = {"docs": glob("docs/*.txt")},
    run = "wc -l -w $(cat $LIST_SRC_DOCS) | sed 's|[^ ]*/docs/|docs/|' > $OUT",
    out = "stats.txt",
)
`,
    },
  },
  {
    dir: 'tools',
    title: 'Generated tools',
    try: 'heph run //:report --cat-out',
    readme: `\`fmt\` generates an executable script with the textfile driver; \`report\`
puts it on PATH through \`tools\` and calls it by name.

  heph run //:report --cat-out`,
    files: {
      BUILD: `target(
    name = "fmt",
    driver = "textfile",
    text = """
#!/bin/sh
printf '== %s ==\\n' "$1"
""",
    out = "fmt",
    executable = True,
)

target(
    name = "report",
    driver = "bash",
    tools = [":fmt"],
    run = "fmt 'built inside the heph sandbox' > $OUT; uname -m >> $OUT",
    out = "report.txt",
)
`,
    },
  },
  {
    dir: 'outputs',
    title: 'Output groups',
    try: 'heph run //:package --cat-out',
    readme: `\`compile\` produces two named outputs; \`package\` consumes only the
\`bin\` group with the \`|bin\` address suffix.

  heph run //:compile --cat-out
  heph run //:package --cat-out`,
    files: {
      BUILD: `target(
    name = "compile",
    driver = "bash",
    run = "echo 'binary bytes' > $OUT_BIN; echo 'api docs' > $OUT_DOC",
    out = {"bin": "app", "doc": "app.txt"},
)

target(
    name = "package",
    driver = "bash",
    deps = [":compile|bin"],
    run = "cat $SRC > $OUT",
    out = "package.txt",
)
`,
    },
  },
  {
    dir: 'monorepo',
    title: 'Packages, groups and queries',
    try: 'heph run //:all',
    readme: `Targets spread over packages, addressed as //pkg:name.

  heph run //services/api:build --cat-out
  heph run //:all                       # a group over every service
  heph run service //...                # every target labelled service
  heph query -e '//services/...'        # list targets matching a query
  heph run //:release --cat-out         # outputs re-exported under new paths`,
    files: {
      'services/api/BUILD': `target(
    name = "build",
    driver = "bash",
    labels = ["service"],
    run = "echo api > $OUT",
    out = "api.txt",
)
`,
      'services/web/BUILD': `target(
    name = "build",
    driver = "bash",
    labels = ["service"],
    deps = ["//libs/ui:build"],
    run = "cat $SRC > $OUT; echo web >> $OUT",
    out = "web.txt",
)
`,
      'libs/ui/BUILD': `target(
    name = "build",
    driver = "bash",
    run = "echo ui > $OUT",
    out = "ui.txt",
)
`,
      BUILD: `target(
    name = "all",
    driver = "group",
    deps = ["//services/api:build", "//services/web:build"],
)

target(
    name = "release",
    driver = "group",
    deps = [":all"],
    strip_prefix = "services",
    prefix = "release",
)
`,
    },
  },
];

/**
 * A `.hephconfig` registering the builtins plus the external plugin entries
 * (already rendered as YAML list items) installed in the VM.
 */
export function hephconfig(pluginEntries: string): string {
  return BASE_PLUGINS + pluginEntries;
}

export const WELCOME = (version: string, examples: Example[], plugins: string[]) => `
heph ${version} — running in your browser on an emulated arm64 Alpine Linux.
External plugins: ${plugins.length ? plugins.join(', ') : 'none in this release'}

Examples live in /root/examples (each has a README):
${examples.map((e) => `  cd ~/examples/${e.dir.padEnd(10)} && ${e.try}`).join('\n')}

The VM is offline and lives in this tab: refresh and it is gone.
`;
