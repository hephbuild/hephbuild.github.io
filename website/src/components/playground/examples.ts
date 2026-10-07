/**
 * The example workspaces copied into the VM under /root/examples. Each one is a
 * self-contained heph workspace with a `.hephconfig`, BUILD files and a README,
 * and makes one point through a few steps: run, change something, run again.
 * Everything runs offline — the VM has no internet; `tcc` is the C compiler.
 */

export interface Step {
  label: string;
  /** Typed into the terminal, from the example's directory. */
  run: string;
  /** What to look for in the output. */
  expect: string;
}

export interface Example {
  dir: string;
  title: string;
  summary: string;
  steps: Step[];
  files: Record<string, string>;
}

const BASE_PLUGINS = `plugins:
  - builtin: buildfile
  - builtin: bash
  - builtin: exec
`;

const HELLO: Example = {
  dir: 'hello',
  title: 'A first build',
  summary: 'Two targets: `greeting` writes a file, `shout` depends on it.',
  steps: [
    {
      label: 'Build it',
      run: 'heph run //:shout --cat-out',
      expect: 'Both targets run and print HELLO WORLD.',
    },
    {
      label: 'Run it again',
      run: 'heph run //:shout',
      expect: 'Nothing runs: both are cache hits.',
    },
    {
      label: 'Change the greeting',
      run: "sed -i 's/hello world/hello heph/' BUILD && heph run //:shout --cat-out",
      expect: 'Its input changed, so both rebuild: HELLO HEPH.',
    },
  ],
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
};

const C_APP: Example = {
  dir: 'c-app',
  title: 'Incremental C build',
  summary: 'A small C program: one compile target per source file, a link step and a test. `--no-tui` prints each target as it runs.',
  steps: [
    {
      label: 'Build and run the app',
      run: 'heph run //:app --no-tui --copy-out out && out/app',
      expect: 'Each object compiles, then the app links: `cache 0 hit / 5 miss`.',
    },
    {
      label: 'Build again',
      run: 'heph run //:app --no-tui',
      expect: 'Nothing runs: `cache 5 hit / 0 miss`.',
    },
    {
      label: 'Change one file',
      run: "sed -i 's/Hello/Howdy/' src/greet.c && heph run //:app --no-tui --copy-out out && out/app",
      expect: 'Only `greet.o` and `app` run; the other objects are cache hits.',
    },
    {
      label: 'Change only a comment',
      run: "sed -i 's|^// .*|// Prints word and character counts.|' src/stats.c && heph run //:app --no-tui",
      expect: 'Only `stats.o` runs. It compiles to the same bytes, so `app` is a cache hit.',
    },
    {
      label: 'Run the tests',
      run: 'heph run test //... --no-tui',
      expect: 'Only the test runs: it reuses the `strutil.o` already built.',
    },
  ],
  files: {
    BUILD: `# One compile step per source file: change one, recompile one.
def c_object(name):
    return target(
        name = name + ".o",
        driver = "bash",
        deps = {"c": file("src/" + name + ".c"), "h": glob("src/*.h")},
        run = "tcc -c $SRC_C -o $OUT",
        out = name + ".o",
    )

objects = [c_object(name) for name in ["main", "greet", "stats", "strutil"]]

target(
    name = "app",
    driver = "bash",
    deps = objects,
    run = "tcc $SRC -o $OUT",
    out = "app",
)

target(
    name = "strutil_test",
    driver = "bash",
    labels = ["test"],
    deps = {"test": file("src/strutil_test.c"), "h": glob("src/*.h"), "lib": ":strutil.o"},
    run = "tcc $SRC_TEST $SRC_LIB -o strutil_test && ./strutil_test > $OUT",
    out = "test.log",
)
`,
    'src/main.c': `#include "greet.h"
#include "stats.h"

int main(int argc, char **argv) {
    greet(argc > 1 ? argv[1] : "world");
    print_stats("heph rebuilds only what changed");
    return 0;
}
`,
    'src/greet.h': 'void greet(const char *name);\n',
    'src/greet.c': `#include <stdio.h>
#include "greet.h"

void greet(const char *name) {
    printf("Hello, %s!\\n", name);
}
`,
    'src/stats.h': 'void print_stats(const char *text);\n',
    'src/stats.c': `// Counts words and characters.
#include <stdio.h>
#include <string.h>
#include "stats.h"
#include "strutil.h"

void print_stats(const char *text) {
    printf("\\"%s\\": %d words, %d characters\\n", text, count_words(text), (int)strlen(text));
}
`,
    'src/strutil.h': 'int count_words(const char *s);\n',
    'src/strutil.c': `#include "strutil.h"

int count_words(const char *s) {
    int n = 0, in_word = 0;
    for (; *s; s++) {
        if (*s == ' ') in_word = 0;
        else if (!in_word) { in_word = 1; n++; }
    }
    return n;
}
`,
    'src/strutil_test.c': `#include <stdio.h>
#include "strutil.h"

static int failures;

static void expect(const char *s, int want) {
    int got = count_words(s);
    if (got != want) {
        printf("FAIL count_words(\\"%s\\") = %d, want %d\\n", s, got, want);
        failures++;
    }
}

int main(void) {
    expect("", 0);
    expect("one", 1);
    expect("  two   words ", 2);
    if (!failures) printf("ok\\n");
    return failures != 0;
}
`,
  },
};

const SANDBOX: Example = {
  dir: 'sandbox',
  title: 'The sandbox catches what you forgot',
  summary: '`banner` reads config.txt, but its BUILD does not declare it as an input.',
  steps: [
    {
      label: 'Run it',
      run: 'heph run //:banner --cat-out',
      expect: 'It fails: config.txt is not in the sandbox.',
    },
    {
      label: 'Declare the input',
      run: "sed -i 's/# deps/deps/' BUILD && heph run //:banner --cat-out",
      expect: 'Now it builds.',
    },
    {
      label: 'Change the input',
      run: "echo 'name = sandboxed' > config.txt && heph run //:banner --cat-out",
      expect: 'A declared input changed, so it rebuilds. A cache hit can be trusted.',
    },
    {
      label: 'Look inside the sandbox',
      run: 'heph run //:banner --shell',
      expect: 'A shell in the sandbox: `ls` shows only config.txt, `run` runs the command, `exit` leaves.',
    },
  ],
  files: {
    'config.txt': 'name = heph\n',
    BUILD: `target(
    name = "banner",
    driver = "bash",
    # deps = [file("config.txt")],
    run = "grep name config.txt > $OUT",
    out = "banner.txt",
)
`,
  },
};

const CODEGEN: Example = {
  dir: 'codegen',
  title: 'Generated files in your tree',
  summary: '`version_h` writes a header next to your sources; `sort` rewrites a file in place.',
  steps: [
    {
      label: 'Generate a header',
      run: 'heph run //:version_h && cat version.h',
      expect: 'version.h now sits in the tree, built from VERSION.',
    },
    {
      label: 'Keep it out of git',
      run: 'heph tool gen-gitignore && cat .gitignore',
      expect: '.gitignore lists every generated file, with the target that makes it.',
    },
    {
      label: 'Rewrite a source in place',
      run: 'heph run //:sort && cat words.txt',
      expect: 'words.txt is sorted. Run it again: nothing to do, it is a cache hit.',
    },
    {
      label: 'Check the tree, as CI would',
      run: 'echo apple >> words.txt && heph run //:sort --frozen',
      expect: 'It fails with a diff: the committed file is not sorted.',
    },
  ],
  files: {
    VERSION: '1.4.0\n',
    'words.txt': 'pear\nfig\nbanana\ncherry\n',
    BUILD: `target(
    name = "version_h",
    driver = "bash",
    codegen = "copy",
    deps = [file("VERSION")],
    run = 'echo "#define VERSION \\\\"$(cat $SRC)\\\\"" > $OUT',
    out = "version.h",
)

target(
    name = "sort",
    driver = "bash",
    codegen = "in_place",
    deps = [file("words.txt")],
    run = "sort -o words.txt words.txt",
    out = "words.txt",
)
`,
  },
};

const STRUTIL_LIB = `#include <ctype.h>
#include "strutil.h"

void upcase(char *s) {
    for (; *s; s++) *s = toupper((unsigned char)*s);
}

int count_words(const char *s) {
    int n = 0, in_word = 0;
    for (; *s; s++) {
        if (*s == ' ') in_word = 0;
        else if (!in_word) { in_word = 1; n++; }
    }
    return n;
}
`;

const appBuild = (out: string, want: string) => `target(
    name = "bin",
    driver = "bash",
    labels = ["bin"],
    deps = {
        "c": file("main.c"),
        # The library's two output groups: its header and its object.
        "hdr": "//libs/strutil:lib|hdr",
        "obj": "//libs/strutil:lib|obj",
    },
    run = "tcc -I $(dirname $SRC_HDR) $SRC_C $SRC_OBJ -o $OUT",
    out = "${out}",
)

target(
    name = "test",
    driver = "bash",
    labels = ["test"],
    deps = {"bin": ":bin"},
    run = '[ "$($SRC_BIN hello big world)" = "${want}" ] && echo ok > $OUT',
    out = "test.log",
)
`;

const MONOREPO: Example = {
  dir: 'monorepo',
  title: 'What does my change affect?',
  summary: 'Two apps share a library, each package with its own tests. `--no-tui` prints each target as it runs.',
  steps: [
    {
      label: 'Run every test',
      run: 'heph run test //... --no-tui',
      expect: 'The library, both apps and the three tests run.',
    },
    {
      label: 'Who uses the library?',
      run: 'heph inspect revdeps //libs/strutil:lib',
      expect: 'Both apps depend on it.',
    },
    {
      label: 'Break the library',
      run: "sed -i 's/toupper/tolower/' libs/strutil/strutil.c && heph run test //... --no-tui",
      expect: 'Everything downstream reruns, and two tests catch the bug.',
    },
    {
      label: 'Fix it',
      run: "sed -i 's/tolower/toupper/' libs/strutil/strutil.c && heph run test //... --no-tui",
      expect: 'The tests pass again. The two that failed are cache hits: their inputs match the last run where they passed.',
    },
    {
      label: 'Change one app',
      run: "sed -i 's/int words/long words/; s/%d/%ld/' apps/count/main.c && heph run test //... --no-tui",
      expect: 'Only `//apps/count` runs; greet and the library are cache hits.',
    },
    {
      label: 'Query the graph',
      run: "heph query -e 'label(test) && !//libs/...'",
      expect: 'Every test outside libs/.',
    },
  ],
  files: {
    'libs/strutil/strutil.h': 'void upcase(char *s);\nint count_words(const char *s);\n',
    'libs/strutil/strutil.c': STRUTIL_LIB,
    'libs/strutil/strutil_test.c': `#include <stdio.h>
#include <string.h>
#include "strutil.h"

int main(void) {
    char s[] = "Big World";
    upcase(s);
    if (strcmp(s, "BIG WORLD") != 0 || count_words("  a b ") != 2) {
        printf("FAIL\\n");
        return 1;
    }
    printf("ok\\n");
    return 0;
}
`,
    'libs/strutil/BUILD': `target(
    name = "lib",
    driver = "bash",
    deps = {"c": file("strutil.c"), "h": file("strutil.h")},
    run = "tcc -c $SRC_C -o $OUT_OBJ && cp $SRC_H $OUT_HDR",
    out = {"obj": "strutil.o", "hdr": "include/strutil.h"},
)

target(
    name = "test",
    driver = "bash",
    labels = ["test"],
    deps = {"test": file("strutil_test.c"), "hdr": ":lib|hdr", "obj": ":lib|obj"},
    run = "tcc -I $(dirname $SRC_HDR) $SRC_TEST $SRC_OBJ -o strutil_test && ./strutil_test > $OUT",
    out = "test.log",
)
`,
    'apps/greet/main.c': `#include <stdio.h>
#include <string.h>
#include "strutil.h"

int main(int argc, char **argv) {
    char line[256] = "";
    for (int i = 1; i < argc; i++) {
        if (i > 1) strcat(line, " ");
        strcat(line, argv[i]);
    }
    upcase(line);
    printf("%s\\n", line);
    return 0;
}
`,
    'apps/greet/BUILD': appBuild('greet', 'HELLO BIG WORLD'),
    'apps/count/main.c': `#include <stdio.h>
#include <string.h>
#include "strutil.h"

int main(int argc, char **argv) {
    int words = 0;
    for (int i = 1; i < argc; i++) words += count_words(argv[i]);
    printf("%d\\n", words);
    return 0;
}
`,
    'apps/count/BUILD': appBuild('count', '3'),
  },
};

const RELEASE: Example = {
  dir: 'release',
  title: 'From build to deploy',
  summary: 'Stamp a version into a binary, package its outputs, and deploy behind a confirmation.',
  steps: [
    {
      label: 'Stamp the version in',
      run: 'heph run //:build --output bin --copy-out out && out/build/hello',
      expect: 'The binary reports the version read from VERSION.',
    },
    {
      label: 'Package the outputs',
      run: 'heph run //:dist --list-out',
      expect: 'The binary and its usage text, re-exported under dist/.',
    },
    {
      label: 'Deploy',
      run: 'heph run //:deploy --cat-out',
      expect: 'heph stops and asks first: press `y` to deploy.',
    },
    {
      label: 'Bump the version and redeploy',
      run: 'echo 1.1.0 > VERSION && heph run //:deploy --auto-approve --cat-out',
      expect: 'Everything downstream of VERSION rebuilds; --auto-approve skips the question.',
    },
  ],
  files: {
    VERSION: '1.0.0\n',
    'main.c': `#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    if (argc > 1 && strcmp(argv[1], "--help") == 0) {
        printf("usage: hello [name]\\n");
        return 0;
    }
    printf("hello %s, from v%s\\n", argc > 1 ? argv[1] : "world", VERSION);
    return 0;
}
`,
    BUILD: `target(
    name = "version",
    driver = "bash",
    deps = [file("VERSION")],
    run = "tr -d '\\\\n' < $SRC > $OUT",
    out = "version.txt",
)

target(
    name = "build",
    driver = "bash",
    deps = {"c": file("main.c")},
    # \${read://:version} is replaced by the output of :version.
    run = """
tcc -DVERSION='"\${read://:version}"' $SRC_C -o $OUT_BIN
$OUT_BIN --help > $OUT_DOC
""",
    out = {"bin": "build/hello", "doc": "build/USAGE.txt"},
)

target(
    name = "dist",
    driver = "group",
    deps = [":build"],
    strip_prefix = "build",
    prefix = "dist",
)

target(
    name = "deploy",
    driver = "bash",
    approval = True,
    cache = False,
    deps = {"dist": ":dist"},
    run = 'echo "Deployed hello \${read://:version}:" > $OUT; basename -a $SRC_DIST | sed "s|^|  dist/|" >> $OUT',
    out = "deploy.log",
)
`,
  },
};

export const EXAMPLES: Example[] = [HELLO, C_APP, SANDBOX, CODEGEN, MONOREPO, RELEASE];

export function readme(ex: Example): string {
  const steps = ex.steps.map((s, i) => `${i + 1}. ${s.label}\n\n     ${s.run}\n\n   ${s.expect}`);
  return `# ${ex.title}\n\n${ex.summary}\n\n${steps.join('\n\n')}\n`;
}

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

Examples live in /root/examples; each README walks through a few steps:
${examples.map((e) => `  ${e.dir.padEnd(10)} ${e.title}`).join('\n')}

Start with:  cd hello && cat README
The VM is offline and lives in this tab: refresh and it is gone.
`;
